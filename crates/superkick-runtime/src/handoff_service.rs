//! Handoff service — orchestrator-facing API for the SUP-46 contract.
//!
//! Wraps the `HandoffRepo` so callers never encode lifecycle transitions by
//! hand. Emits run events so handoff flow is visible in the same audit stream
//! that already carries steps, agent output, and attention activity.

use std::sync::Arc;

use anyhow::{Context, Result};
use tracing::info;

use superkick_core::{
    AgentSessionId, AttentionRequestId, EventKind, EventLevel, Handoff, HandoffFailure, HandoffId,
    HandoffPayload, HandoffResult, RunEvent, RunId, StepId,
};
use superkick_storage::repo::{HandoffRepo, RunEventRepo};

/// Orchestrator-facing operations on handoffs. Thin wrapper over the repo —
/// every transition goes through the core state machine on `Handoff`.
pub struct HandoffService<H, E> {
    handoff_repo: Arc<H>,
    event_repo: Arc<E>,
}

impl<H, E> HandoffService<H, E>
where
    H: HandoffRepo + 'static,
    E: RunEventRepo + 'static,
{
    pub fn new(handoff_repo: Arc<H>, event_repo: Arc<E>) -> Self {
        Self {
            handoff_repo,
            event_repo,
        }
    }

    /// Create and persist a new Pending handoff.
    pub async fn create(
        &self,
        run_id: RunId,
        origin_step_id: StepId,
        from_session_id: Option<AgentSessionId>,
        to_role: String,
        payload: HandoffPayload,
        parent_handoff: Option<HandoffId>,
    ) -> Result<Handoff> {
        let handoff = Handoff::new(
            run_id,
            origin_step_id,
            from_session_id,
            to_role,
            payload,
            parent_handoff,
        )?;
        self.handoff_repo.insert(&handoff).await?;
        self.emit(
            run_id,
            Some(origin_step_id),
            EventKind::HandoffCreated,
            EventLevel::Info,
            format!(
                "handoff created: kind={} to_role={} id={}",
                handoff.kind, handoff.to_role, handoff.id
            ),
            serde_json::to_value(&handoff).ok(),
        )
        .await;
        info!(
            run_id = %run_id,
            handoff_id = %handoff.id,
            kind = %handoff.kind,
            to_role = %handoff.to_role,
            "handoff created"
        );
        Ok(handoff)
    }

    /// Mark a handoff `Delivered` once a fulfilling session has been spawned.
    pub async fn mark_delivered(
        &self,
        handoff_id: HandoffId,
        to_session_id: AgentSessionId,
    ) -> Result<Handoff> {
        let mut handoff = self
            .handoff_repo
            .get(handoff_id)
            .await?
            .context("handoff not found")?;
        handoff.mark_delivered(to_session_id)?;
        self.handoff_repo.update(&handoff).await?;
        self.emit(
            handoff.run_id,
            Some(handoff.origin_step_id),
            EventKind::HandoffDelivered,
            EventLevel::Info,
            format!(
                "handoff delivered: id={} session={}",
                handoff.id, to_session_id
            ),
            None,
        )
        .await;
        Ok(handoff)
    }

    /// Mark a delivered handoff as accepted (fulfilling session is running).
    pub async fn mark_accepted(&self, handoff_id: HandoffId) -> Result<Handoff> {
        let mut handoff = self
            .handoff_repo
            .get(handoff_id)
            .await?
            .context("handoff not found")?;
        handoff.mark_accepted()?;
        self.handoff_repo.update(&handoff).await?;
        Ok(handoff)
    }

    /// Record a successful completion.
    pub async fn complete(&self, handoff_id: HandoffId, result: HandoffResult) -> Result<Handoff> {
        let mut handoff = self
            .handoff_repo
            .get(handoff_id)
            .await?
            .context("handoff not found")?;
        handoff.complete(result)?;
        self.handoff_repo.update(&handoff).await?;
        self.emit(
            handoff.run_id,
            Some(handoff.origin_step_id),
            EventKind::HandoffCompleted,
            EventLevel::Info,
            format!("handoff completed: id={}", handoff.id),
            serde_json::to_value(&handoff.result).ok(),
        )
        .await;
        Ok(handoff)
    }

    /// Record a terminal failure. Callers decide whether to retry (via a new
    /// handoff with `parent_handoff = failed.id`) or escalate.
    pub async fn fail(&self, handoff_id: HandoffId, failure: HandoffFailure) -> Result<Handoff> {
        let mut handoff = self
            .handoff_repo
            .get(handoff_id)
            .await?
            .context("handoff not found")?;
        handoff.fail(failure)?;
        self.handoff_repo.update(&handoff).await?;
        self.emit(
            handoff.run_id,
            Some(handoff.origin_step_id),
            EventKind::HandoffFailed,
            EventLevel::Warn,
            format!("handoff failed: id={}", handoff.id),
            serde_json::to_value(&handoff.failure).ok(),
        )
        .await;
        Ok(handoff)
    }

    /// Mark a failed handoff as escalated to an existing attention request.
    pub async fn escalate(
        &self,
        handoff_id: HandoffId,
        attention_id: AttentionRequestId,
    ) -> Result<Handoff> {
        let mut handoff = self
            .handoff_repo
            .get(handoff_id)
            .await?
            .context("handoff not found")?;
        handoff.escalate(attention_id)?;
        self.handoff_repo.update(&handoff).await?;
        Ok(handoff)
    }

    pub async fn supersede(&self, handoff_id: HandoffId) -> Result<Handoff> {
        let mut handoff = self
            .handoff_repo
            .get(handoff_id)
            .await?
            .context("handoff not found")?;
        handoff.supersede()?;
        self.handoff_repo.update(&handoff).await?;
        Ok(handoff)
    }

    pub async fn list_by_run(&self, run_id: RunId) -> Result<Vec<Handoff>> {
        self.handoff_repo.list_by_run(run_id).await
    }

    async fn emit(
        &self,
        run_id: RunId,
        step_id: Option<StepId>,
        kind: EventKind,
        level: EventLevel,
        message: String,
        payload: Option<serde_json::Value>,
    ) {
        let mut event = RunEvent::new(run_id, step_id, kind, level, message);
        event.payload_json = payload;
        if let Err(e) = self.event_repo.insert(&event).await {
            tracing::warn!("failed to emit handoff event: {e}");
        }
    }
}
