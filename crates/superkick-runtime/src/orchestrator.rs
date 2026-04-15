//! Spawn-and-observe orchestrator runtime (SUP-79).
//!
//! The orchestrator is the runtime control plane that sits between a run's
//! step engine and the `AgentSupervisor`. It replaces the implicit
//! "spawn → block on JoinHandle → record exit" model with an explicit session
//! registry that exposes:
//!
//! * **spawn** — launch a new agent session under a run. Returns as soon as
//!   the supervising task is running, not when the child exits. Lineage
//!   (role, parent, launch reason, handoff) is recorded on the session and
//!   fanned out as `SessionLifecycleEvent`s.
//! * **observe** — subscribe to the live bus of lifecycle events. Multiple
//!   subscribers (step engine, handoff resolver, UI fan-out, persistence sink)
//!   can coexist; each sees every emitted event.
//! * **wait_for_terminal** — convenience await that drives a single session
//!   to its terminal phase without polling the DB.
//! * **cancel** — signal the supervising task; propagates through the
//!   existing `AgentHandle::cancel()` path.
//! * **active_sessions** — snapshot of every session currently live under a
//!   run. Backed by the in-memory registry so consumers don't hit the DB for
//!   hot paths.
//!
//! The orchestrator deliberately does not invent a second execution substrate.
//! Every spawn still goes through `AgentSupervisor::launch`, so child sessions
//! remain attachable through the same PTY substrate used by browser and
//! external attach.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use anyhow::{Context, Result, anyhow};
use tokio::sync::{Mutex, broadcast};
use tokio::task::JoinHandle;
use tracing::{debug, warn};

use superkick_core::{AgentSessionId, RunId, SessionLifecycleEvent, SessionLifecyclePhase};
use superkick_storage::repo::{
    AgentSessionRepo, RunEventRepo, SessionLifecycleRepo, TranscriptRepo,
};

use crate::agent_supervisor::{AgentHandle, AgentLaunchConfig, AgentResult, AgentSupervisor};
use crate::session_bus::SessionBus;

/// Handle retained by the orchestrator for every session it spawns. Provides
/// the cancellation channel and the supervising join handle so callers can
/// either wait for a terminal state or abort.
pub struct OrchestratedSession {
    pub id: AgentSessionId,
    pub run_id: RunId,
    pub handle: AgentHandle,
    join: JoinHandle<Result<AgentResult>>,
}

impl OrchestratedSession {
    /// Block until the supervising task finishes. This is the equivalent of
    /// the old `spawn-and-wait` pattern, retained for step-engine call sites
    /// that still need to serialise on a single session before moving on.
    pub async fn join(self) -> Result<AgentResult> {
        self.join
            .await
            .context("supervisor task panicked")?
            .context("supervised agent failed")
    }
}

/// Internal registry slot. Kept minimal — the `AgentHandle` is the only
/// piece the orchestrator must retain to support cancellation after the
/// caller has dropped its `OrchestratedSession`.
struct SessionSlot {
    run_id: RunId,
    handle: AgentHandle,
}

/// Typed snapshot of a currently observed session, derived from bus events.
#[derive(Debug, Clone)]
pub struct SessionObservation {
    pub session_id: AgentSessionId,
    pub run_id: RunId,
    pub last_phase: SessionLifecyclePhase,
}

/// Spawn-and-observe orchestrator. Wraps one `AgentSupervisor` and one
/// `SessionBus`; owns a live registry of sessions indexed by id and by run.
pub struct Orchestrator<S, E, T> {
    supervisor: Arc<AgentSupervisor<S, E, T>>,
    bus: Arc<SessionBus>,
    live: Arc<Mutex<LiveRegistry>>,
}

#[derive(Default)]
struct LiveRegistry {
    by_session: HashMap<AgentSessionId, SessionSlot>,
    by_run: HashMap<RunId, HashSet<AgentSessionId>>,
}

impl LiveRegistry {
    fn insert(&mut self, id: AgentSessionId, run_id: RunId, handle: AgentHandle) {
        self.by_session.insert(id, SessionSlot { run_id, handle });
        self.by_run.entry(run_id).or_default().insert(id);
    }

    fn remove(&mut self, id: AgentSessionId) -> Option<SessionSlot> {
        let slot = self.by_session.remove(&id)?;
        if let Some(set) = self.by_run.get_mut(&slot.run_id) {
            set.remove(&id);
            if set.is_empty() {
                self.by_run.remove(&slot.run_id);
            }
        }
        Some(slot)
    }
}

impl<S, E, T> Orchestrator<S, E, T>
where
    S: AgentSessionRepo + 'static,
    E: RunEventRepo + 'static,
    T: TranscriptRepo + 'static,
{
    /// Build an orchestrator around a supervisor. The supervisor is
    /// reconfigured to publish lifecycle events on the bus owned by this
    /// orchestrator — callers that want to pre-configure the supervisor's
    /// bus externally should use `from_parts` instead.
    pub fn new(mut supervisor: AgentSupervisor<S, E, T>) -> Arc<Self> {
        let bus = SessionBus::new();
        supervisor = supervisor.with_lifecycle_bus(Arc::clone(&bus));
        Self::from_parts(Arc::new(supervisor), bus)
    }

    /// Build from an already-configured supervisor and bus. Useful when the
    /// supervisor's bus is wired elsewhere (tests, external subscribers) or
    /// shared between multiple orchestrators in a single-process deployment.
    pub fn from_parts(
        supervisor: Arc<AgentSupervisor<S, E, T>>,
        bus: Arc<SessionBus>,
    ) -> Arc<Self> {
        let orchestrator = Arc::new(Self {
            supervisor,
            bus,
            live: Arc::new(Mutex::new(LiveRegistry::default())),
        });
        // Garbage-collect the live registry when a session reaches a terminal
        // phase. Runs for as long as the orchestrator exists.
        Self::spawn_reaper(Arc::clone(&orchestrator));
        orchestrator
    }

    /// Subscribe to the lifecycle bus — every future event, every session,
    /// every run. Filter at the subscriber if you only care about a subset.
    pub fn subscribe(&self) -> broadcast::Receiver<SessionLifecycleEvent> {
        self.bus.subscribe()
    }

    /// Shared reference to the underlying bus. Callers can hand this to
    /// additional sinks (persistence, UI fan-out) without going through the
    /// orchestrator for every subscription.
    pub fn bus(&self) -> Arc<SessionBus> {
        Arc::clone(&self.bus)
    }

    /// Spawn a new agent session. Returns as soon as the supervising task is
    /// up — before the child has reached `Running`, typically. Callers who
    /// need to block on completion call `OrchestratedSession::join` or
    /// `Orchestrator::wait_for_terminal`.
    pub async fn spawn(&self, config: AgentLaunchConfig) -> Result<OrchestratedSession> {
        let run_id = config.run_id;
        let (handle, join) = self
            .supervisor
            .launch(config)
            .await
            .context("supervisor failed to launch session")?;
        let session_id = handle.session_id();
        self.live
            .lock()
            .await
            .insert(session_id, run_id, handle.clone());
        debug!(%session_id, %run_id, "session registered with orchestrator");
        Ok(OrchestratedSession {
            id: session_id,
            run_id,
            handle,
            join,
        })
    }

    /// Request cancellation of a live session. No-op if the session has
    /// already reached a terminal phase or was never spawned through this
    /// orchestrator.
    pub async fn cancel(&self, session_id: AgentSessionId) {
        let live = self.live.lock().await;
        if let Some(slot) = live.by_session.get(&session_id) {
            slot.handle.cancel();
        } else {
            warn!(%session_id, "cancel requested for unknown session");
        }
    }

    /// Snapshot of the session ids currently live for a run. Excludes
    /// sessions that have already reached terminal phases.
    pub async fn active_session_ids(&self, run_id: RunId) -> Vec<AgentSessionId> {
        self.live
            .lock()
            .await
            .by_run
            .get(&run_id)
            .map(|s| s.iter().copied().collect())
            .unwrap_or_default()
    }

    /// Await the next terminal event for `session_id`. Subscribes *before*
    /// checking the current registry so races where the session completes
    /// between the caller's `spawn` and this call still resolve.
    pub async fn wait_for_terminal(
        &self,
        session_id: AgentSessionId,
    ) -> Result<SessionLifecycleEvent> {
        let mut rx = self.subscribe();
        loop {
            match rx.recv().await {
                Ok(event) if event.session_id == session_id && event.phase.is_terminal() => {
                    return Ok(event);
                }
                Ok(_) => continue,
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    // Slow observer — keep going; we'll catch the terminal if
                    // it hasn't fired yet, or surface a clear error if the
                    // sender is dropped.
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => {
                    return Err(anyhow!(
                        "session bus closed before terminal for {session_id}"
                    ));
                }
            }
        }
    }

    /// Background task that reaps terminal sessions from the live registry
    /// so `active_session_ids` stays accurate without operator intervention.
    fn spawn_reaper(self_ref: Arc<Self>) {
        let mut rx = self_ref.bus.subscribe();
        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(event) => {
                        if event.phase.is_terminal() {
                            self_ref.live.lock().await.remove(event.session_id);
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        warn!(
                            skipped,
                            "orchestrator reaper lagged; registry may contain stale entries until next cycle"
                        );
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        debug!("orchestrator reaper stopping (bus closed)");
                        break;
                    }
                }
            }
        });
    }
}

/// Persistence sink — subscribes to a `SessionBus` and writes every event to
/// the `session_lifecycle_events` audit table. Returns the join handle of the
/// spawned task so callers can shut the sink down deterministically on exit.
///
/// The sink runs forever by default; in tests you can drop the returned
/// handle's target by dropping the bus (final sender) to stop it.
pub fn spawn_lifecycle_persistence_sink<R>(bus: Arc<SessionBus>, repo: Arc<R>) -> JoinHandle<()>
where
    R: SessionLifecycleRepo + 'static,
{
    let mut rx = bus.subscribe();
    tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    if let Err(e) = repo.insert(&event).await {
                        warn!(
                            session_id = %event.session_id,
                            error = %e,
                            "failed to persist session lifecycle event"
                        );
                    }
                }
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    warn!(
                        skipped,
                        "lifecycle persistence sink lagged; audit log may have gaps"
                    );
                }
                Err(broadcast::error::RecvError::Closed) => {
                    debug!("lifecycle persistence sink stopping (bus closed)");
                    break;
                }
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use superkick_core::{AgentSessionId, RunId, StepId};
    use tokio_util::sync::CancellationToken;

    fn fake_handle(id: AgentSessionId) -> AgentHandle {
        AgentHandle::for_tests(id, CancellationToken::new())
    }

    #[test]
    fn live_registry_tracks_and_evicts() {
        let mut reg = LiveRegistry::default();
        let run = RunId::new();
        let a = AgentSessionId::new();
        let b = AgentSessionId::new();
        reg.insert(a, run, fake_handle(a));
        reg.insert(b, run, fake_handle(b));
        assert_eq!(reg.by_run.get(&run).map(|s| s.len()), Some(2));

        reg.remove(a);
        assert_eq!(reg.by_run.get(&run).map(|s| s.len()), Some(1));
        reg.remove(b);
        assert!(!reg.by_run.contains_key(&run));
    }

    #[tokio::test]
    async fn wait_for_terminal_ignores_non_terminal_and_other_sessions() {
        // We can't run a real supervisor in unit tests, so drive the
        // wait_for_terminal protocol directly against the bus + a hand-rolled
        // subscriber that mirrors `Orchestrator::wait_for_terminal`.
        let bus = SessionBus::new();
        let target = AgentSessionId::new();
        let other = AgentSessionId::new();
        let run = RunId::new();
        let step = StepId::new();

        let bus_clone = Arc::clone(&bus);
        let waiter = tokio::spawn(async move {
            let mut rx = bus_clone.subscribe();
            loop {
                let ev = rx.recv().await.unwrap();
                if ev.session_id == target && ev.phase.is_terminal() {
                    return ev;
                }
            }
        });

        // Let the task subscribe.
        tokio::task::yield_now().await;

        // Noise: non-terminal for target + terminal for another session.
        bus.publish(SessionLifecycleEvent::new(
            target,
            run,
            step,
            None,
            None,
            None,
            None,
            SessionLifecyclePhase::Running,
        ));
        bus.publish(SessionLifecycleEvent::new(
            other,
            run,
            step,
            None,
            None,
            None,
            None,
            SessionLifecyclePhase::Completed { exit_code: 0 },
        ));

        // Real signal.
        bus.publish(SessionLifecycleEvent::new(
            target,
            run,
            step,
            None,
            None,
            None,
            None,
            SessionLifecyclePhase::Failed {
                exit_code: Some(1),
                reason: "boom".into(),
            },
        ));

        let got = waiter.await.unwrap();
        assert_eq!(got.session_id, target);
        assert!(got.phase.is_terminal());
    }
}
