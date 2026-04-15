//! SUP-48 ownership service.
//!
//! Central choke point for session-ownership transitions. Composes the core
//! state machine (`superkick_core::ownership::transition_*`) with:
//!
//! * persistence (`SessionOwnershipRepo`) — writes the audit row and updates
//!   the denormalised snapshot on `agent_sessions` in one transaction;
//! * audit stream (`RunEventRepo`) — emits a `RunEvent` so ownership changes
//!   appear in the same timeline as steps, agent output, and handoffs;
//! * the PTY single-writer lease (`PtySession`) — *read-only* here: the lease
//!   stays orthogonal to orchestration ownership (see `superkick_core::ownership`
//!   for the rationale). When reporting `SessionOwnership` we attach the current
//!   writer so consumers can show both facts in one call.
//!
//! The PTY lease is *not* flipped automatically on takeover: a human who wants
//! to also type into the terminal has to explicitly attach. This avoids hidden
//! control transfers that the operator can't inspect.

use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};

use anyhow::{Context, Result};
use chrono::Utc;
use thiserror::Error;
use tokio::sync::Mutex;
use tracing::info;

use superkick_core::{
    AgentSessionId, EventKind, EventLevel, OperatorId, OrchestrationOwner, OwnershipError,
    OwnershipEvent, OwnershipTransitionReason, RunEvent, RunId, SessionOwnership, SuspendReason,
    WriterLeaseInfo, transition_release, transition_resume, transition_suspend,
    transition_takeover,
};
use superkick_storage::repo::{RunEventRepo, SessionOwnershipRepo};

use crate::pty_session::{PtySessionRegistry, WriterHolder};

/// Snapshot of PTY writer state, suitable for `SessionOwnership`. `None` when
/// no human currently holds the lease.
fn writer_info(registry: &PtySessionRegistry, run_id: RunId) -> Option<WriterLeaseInfo> {
    let session = registry.get(run_id)?;
    let holder = session.current_writer()?;
    Some(match holder {
        WriterHolder::Browser(id) => WriterLeaseInfo::Browser { holder_id: id },
        WriterHolder::External(id) => WriterLeaseInfo::External { holder_id: id },
    })
}

pub struct OwnershipService<R, E> {
    ownership_repo: Arc<R>,
    event_repo: Arc<E>,
    pty_registry: Arc<PtySessionRegistry>,
    /// Per-session mutex guarding the read-modify-write in `apply`. Prevents
    /// two concurrent transitions from racing on the same session: each call
    /// takes the session's lock before loading the current owner and releases
    /// it after the audit row + snapshot are committed.
    session_locks: StdMutex<HashMap<AgentSessionId, Arc<Mutex<()>>>>,
}

/// Errors surfaced by the service. Thin wrapper so callers can distinguish
/// "state machine rejected" from "session not found" from storage failures.
#[derive(Debug, Error)]
pub enum ServiceError {
    #[error("session {0} not found")]
    SessionNotFound(AgentSessionId),
    #[error(transparent)]
    Ownership(#[from] OwnershipError),
    #[error(transparent)]
    Storage(#[from] anyhow::Error),
}

impl<R, E> OwnershipService<R, E>
where
    R: SessionOwnershipRepo + 'static,
    E: RunEventRepo + 'static,
{
    pub fn new(
        ownership_repo: Arc<R>,
        event_repo: Arc<E>,
        pty_registry: Arc<PtySessionRegistry>,
    ) -> Self {
        Self {
            ownership_repo,
            event_repo,
            pty_registry,
            session_locks: StdMutex::new(HashMap::new()),
        }
    }

    fn lock_for(&self, session_id: AgentSessionId) -> Arc<Mutex<()>> {
        let mut map = self
            .session_locks
            .lock()
            .expect("ownership session lock map poisoned");
        map.entry(session_id)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }

    /// Current ownership snapshot for a session, including writer lease info.
    pub async fn snapshot(
        &self,
        session_id: AgentSessionId,
    ) -> Result<SessionOwnership, ServiceError> {
        let snap = self
            .ownership_repo
            .current(session_id)
            .await
            .map_err(ServiceError::Storage)?
            .ok_or(ServiceError::SessionNotFound(session_id))?;
        let since = snap.since.unwrap_or_else(|| {
            tracing::warn!(
                session_id = %snap.session_id,
                "session ownership snapshot missing `since`; falling back to now \
                 (expected only for rows predating the SUP-48 migration)",
            );
            Utc::now()
        });
        Ok(SessionOwnership {
            session_id: snap.session_id,
            run_id: snap.run_id,
            orchestration: snap.owner,
            since,
            writer: writer_info(&self.pty_registry, snap.run_id),
        })
    }

    /// Operator takes over orchestration of a session. Pauses the orchestrator
    /// until an explicit release. Note: does **not** acquire the PTY writer
    /// lease — that stays a separate, explicit attach action.
    pub async fn takeover(
        &self,
        session_id: AgentSessionId,
        operator: OperatorId,
        note: Option<String>,
    ) -> Result<SessionOwnership, ServiceError> {
        let next = self
            .apply(
                session_id,
                OwnershipTransitionReason::OperatorTakeover,
                Some(operator.clone()),
                |current| transition_takeover(current, operator.clone(), note.clone()),
            )
            .await?;
        Ok(next)
    }

    /// Operator returns control to the orchestrator. Only the current operator
    /// can release — another operator has to take over first.
    pub async fn release(
        &self,
        session_id: AgentSessionId,
        operator: OperatorId,
    ) -> Result<SessionOwnership, ServiceError> {
        self.apply(
            session_id,
            OwnershipTransitionReason::OperatorRelease,
            Some(operator.clone()),
            |current| transition_release(current, &operator),
        )
        .await
    }

    /// Orchestrator suspends itself waiting for a handoff / attention.
    pub async fn suspend(
        &self,
        session_id: AgentSessionId,
        reason: SuspendReason,
        transition_reason: OwnershipTransitionReason,
    ) -> Result<SessionOwnership, ServiceError> {
        self.apply(session_id, transition_reason, None, |current| {
            transition_suspend(current, reason.clone())
        })
        .await
    }

    /// Resume automation from a suspended state.
    pub async fn resume(
        &self,
        session_id: AgentSessionId,
        transition_reason: OwnershipTransitionReason,
    ) -> Result<SessionOwnership, ServiceError> {
        self.apply(session_id, transition_reason, None, transition_resume)
            .await
    }

    /// Internal — load current owner, apply a transition closure, persist,
    /// emit the run event, and return the resulting snapshot.
    async fn apply<F>(
        &self,
        session_id: AgentSessionId,
        reason: OwnershipTransitionReason,
        operator: Option<OperatorId>,
        f: F,
    ) -> Result<SessionOwnership, ServiceError>
    where
        F: FnOnce(&OrchestrationOwner) -> Result<OrchestrationOwner, OwnershipError>,
    {
        // Serialize read-modify-write per session so concurrent callers can't
        // both observe the same current owner and race to overwrite each other.
        let lock = self.lock_for(session_id);
        let _guard = lock.lock().await;

        let current = self
            .ownership_repo
            .current(session_id)
            .await
            .map_err(ServiceError::Storage)?
            .ok_or(ServiceError::SessionNotFound(session_id))?;

        let next = f(&current.owner)?;
        let now = Utc::now();
        let event = OwnershipEvent::new(
            current.run_id,
            session_id,
            Some(current.owner.clone()),
            next.clone(),
            reason,
            operator,
        );

        self.ownership_repo
            .apply(&event, now)
            .await
            .map_err(ServiceError::Storage)?;

        self.emit_run_event(&event).await;

        info!(
            run_id = %current.run_id,
            session_id = %session_id,
            from = current.owner.kind_str(),
            to = next.kind_str(),
            reason = ?reason,
            "session ownership transition",
        );

        Ok(SessionOwnership {
            session_id,
            run_id: current.run_id,
            orchestration: next,
            since: now,
            writer: writer_info(&self.pty_registry, current.run_id),
        })
    }

    async fn emit_run_event(&self, event: &OwnershipEvent) {
        let kind = match event.reason {
            OwnershipTransitionReason::OperatorTakeover => EventKind::OwnershipTakenOver,
            OwnershipTransitionReason::OperatorRelease => EventKind::OwnershipReleased,
            OwnershipTransitionReason::HandoffPending
            | OwnershipTransitionReason::AttentionRaised => EventKind::OwnershipSuspended,
            OwnershipTransitionReason::HandoffResolved
            | OwnershipTransitionReason::AttentionResolved => EventKind::OwnershipResumed,
            OwnershipTransitionReason::SessionEnded => EventKind::OwnershipReleased,
        };
        let message = format!(
            "ownership: {} -> {} ({:?})",
            event
                .from
                .as_ref()
                .map(|o| o.kind_str())
                .unwrap_or("orchestrator"),
            event.to.kind_str(),
            event.reason,
        );
        let mut run_event = RunEvent::new(event.run_id, None, kind, EventLevel::Info, message);
        run_event.payload_json = serde_json::to_value(event).ok();
        if let Err(e) = self.event_repo.insert(&run_event).await {
            tracing::warn!("failed to emit ownership run event: {e}");
        }
    }

    /// Batch snapshot for every session in a run. Used by `get_run` to avoid
    /// an N+1 against `agent_sessions`. Writer lease info is resolved from
    /// the in-process PTY registry, not the DB.
    pub async fn snapshots_for_run(
        &self,
        run_id: RunId,
    ) -> Result<Vec<SessionOwnership>, ServiceError> {
        let snaps = self
            .ownership_repo
            .list_current_by_run(run_id)
            .await
            .map_err(ServiceError::Storage)?;
        let now = Utc::now();
        Ok(snaps
            .into_iter()
            .map(|snap| {
                let since = snap.since.unwrap_or_else(|| {
                    tracing::warn!(
                        session_id = %snap.session_id,
                        "session ownership snapshot missing `since`; falling back to now",
                    );
                    now
                });
                SessionOwnership {
                    session_id: snap.session_id,
                    run_id: snap.run_id,
                    orchestration: snap.owner,
                    since,
                    writer: writer_info(&self.pty_registry, snap.run_id),
                }
            })
            .collect())
    }

    /// List the ownership audit trail for a session.
    pub async fn history(&self, session_id: AgentSessionId) -> Result<Vec<OwnershipEvent>> {
        self.ownership_repo
            .list_by_session(session_id)
            .await
            .context("list session ownership history")
    }
}
