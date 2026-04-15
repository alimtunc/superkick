//! Local agent supervisor — spawns and manages CLI agent processes (claude, codex).
//!
//! Owns the full lifecycle: spawn → stream output → wait/timeout/cancel → record result.
//!
//! The agent is spawned inside a PTY so that TTY-aware CLIs see a real terminal
//! and stream output incrementally. Claude runs in interactive mode (no `--print`)
//! with the initial prompt supplied as the positional `prompt` argument, so the
//! browser-attached terminal mirrors a live Claude Code session.
//! Because a PTY merges stdout and stderr into a single terminal stream, all output
//! is emitted as `EventLevel::Info`. Lifecycle events retain their original levels.

mod lifecycle;
pub(crate) mod output;
mod process;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use chrono::Utc;
use tokio_util::sync::CancellationToken;

use superkick_core::{
    AgentProvider, AgentSession, AgentSessionId, AgentStatus, HandoffId, LaunchReason,
    LinearContextMode, RunId, SessionLifecycleEvent, SessionLifecyclePhase, StepId,
};
use superkick_storage::repo::{AgentSessionRepo, RunEventRepo, TranscriptRepo};

use crate::pty_session::PtySessionRegistry;
use crate::session_bus::SessionBus;

/// Lineage + intent metadata attached to every spawn (SUP-46). Every agent
/// session gets one — the orchestrator populates it so sessions are explicit
/// units of work, not opaque subprocesses.
#[derive(Debug, Clone)]
pub struct SessionLaunchInfo {
    /// Catalog role this session fills (`planner`, `reviewer`, ...).
    pub role: String,
    /// Short human/auditor-facing summary of what this session is for.
    pub purpose: String,
    /// Parent session that requested this child. `None` = orchestrator.
    pub parent_session_id: Option<AgentSessionId>,
    /// Why this session was launched.
    pub launch_reason: LaunchReason,
    /// Handoff this spawn fulfils, if any.
    pub handoff_id: Option<HandoffId>,
}

/// Configuration for launching an agent session.
pub struct AgentLaunchConfig {
    pub run_id: RunId,
    pub step_id: StepId,
    pub provider: AgentProvider,
    /// Full command-line arguments (e.g. `["claude", "--dangerously-skip-permissions", "fix the bug"]`).
    pub args: Vec<String>,
    /// Working directory (worktree path).
    pub workdir: PathBuf,
    /// Maximum duration before the process is killed.
    pub timeout: Duration,
    /// How Linear context was delivered to this spawn. Recorded on the
    /// `AgentSession` so the run log makes the decision inspectable.
    pub linear_context_mode: LinearContextMode,
    /// Lineage + intent metadata (SUP-46).
    pub session_launch: SessionLaunchInfo,
}

/// Result of a completed agent session.
#[derive(Debug)]
pub struct AgentResult {
    pub session: AgentSession,
}

/// Handle to a running agent session, used for cancellation.
#[derive(Clone)]
pub struct AgentHandle {
    session_id: AgentSessionId,
    cancel_token: CancellationToken,
}

impl AgentHandle {
    pub fn session_id(&self) -> AgentSessionId {
        self.session_id
    }

    /// Request cancellation of the running agent.
    pub fn cancel(&self) {
        self.cancel_token.cancel();
    }

    /// Construct a handle for unit tests that exercise registry/observation
    /// logic without spawning a real process.
    #[cfg(test)]
    pub fn for_tests(session_id: AgentSessionId, cancel_token: CancellationToken) -> Self {
        Self {
            session_id,
            cancel_token,
        }
    }
}

/// Process supervisor for local CLI agents.
pub struct AgentSupervisor<S, E, T> {
    session_repo: Arc<S>,
    event_repo: Arc<E>,
    transcript_repo: Arc<T>,
    registry: Arc<PtySessionRegistry>,
    /// Optional lifecycle bus (SUP-79). When wired, every session state
    /// transition publishes a `SessionLifecycleEvent` so the orchestrator and
    /// other subscribers can react without blocking on the join handle.
    lifecycle_bus: Option<Arc<SessionBus>>,
}

impl<S, E, T> AgentSupervisor<S, E, T>
where
    S: AgentSessionRepo + 'static,
    E: RunEventRepo + 'static,
    T: TranscriptRepo + 'static,
{
    pub fn new(
        session_repo: Arc<S>,
        event_repo: Arc<E>,
        transcript_repo: Arc<T>,
        registry: Arc<PtySessionRegistry>,
    ) -> Self {
        Self {
            session_repo,
            event_repo,
            transcript_repo,
            registry,
            lifecycle_bus: None,
        }
    }

    /// Attach a `SessionBus` so every session this supervisor launches
    /// publishes lifecycle events as it transitions through
    /// Spawning → Running → terminal.
    pub fn with_lifecycle_bus(mut self, bus: Arc<SessionBus>) -> Self {
        self.lifecycle_bus = Some(bus);
        self
    }

    /// Public accessor for the attached bus, if any — lets orchestrator-tier
    /// wiring subscribe without having to pass the `Arc` around separately.
    pub fn lifecycle_bus(&self) -> Option<Arc<SessionBus>> {
        self.lifecycle_bus.clone()
    }

    /// Launch an agent process and supervise it to completion.
    ///
    /// Returns an `AgentHandle` for cancellation and a `JoinHandle` for the result.
    pub async fn launch(
        &self,
        config: AgentLaunchConfig,
    ) -> Result<(AgentHandle, tokio::task::JoinHandle<Result<AgentResult>>)> {
        let session_id = AgentSessionId::new();
        let command_str = config.args.join(" ");

        let session = AgentSession {
            id: session_id,
            run_id: config.run_id,
            run_step_id: config.step_id,
            provider: config.provider,
            command: command_str,
            pid: None,
            status: AgentStatus::Starting,
            started_at: Utc::now(),
            finished_at: None,
            exit_code: None,
            linear_context_mode: Some(config.linear_context_mode),
            role: Some(config.session_launch.role.clone()),
            purpose: Some(config.session_launch.purpose.clone()),
            parent_session_id: config.session_launch.parent_session_id,
            launch_reason: Some(config.session_launch.launch_reason),
            handoff_id: config.session_launch.handoff_id,
        };

        self.session_repo.insert(&session).await?;

        // Announce the session exists but hasn't yet been spawned. Observers
        // that care about "a new child is about to come online" pick this up
        // before the PTY is up.
        publish_lifecycle(
            self.lifecycle_bus.as_deref(),
            &session,
            SessionLifecyclePhase::Spawning,
        );

        let cancel_token = CancellationToken::new();
        let handle = AgentHandle {
            session_id,
            cancel_token: cancel_token.clone(),
        };

        let session_repo = Arc::clone(&self.session_repo);
        let event_repo = Arc::clone(&self.event_repo);
        let transcript_repo = Arc::clone(&self.transcript_repo);
        let registry = Arc::clone(&self.registry);

        let deps = lifecycle::SupervisedDeps {
            session_repo,
            event_repo,
            transcript_repo,
            registry,
            lifecycle_bus: self.lifecycle_bus.clone(),
        };

        let join = tokio::spawn(lifecycle::run_supervised(
            session,
            config.args,
            config.workdir,
            config.timeout,
            cancel_token,
            deps,
        ));

        Ok((handle, join))
    }
}

/// Publish a lifecycle event derived from the session's current lineage state,
/// if a bus is attached. Lineage fields on the event are populated from the
/// session so subscribers can filter without a DB round-trip.
pub(crate) fn publish_lifecycle(
    bus: Option<&SessionBus>,
    session: &AgentSession,
    phase: SessionLifecyclePhase,
) {
    let Some(bus) = bus else {
        return;
    };
    let event = SessionLifecycleEvent::new(
        session.id,
        session.run_id,
        session.run_step_id,
        session.role.clone(),
        session.parent_session_id,
        session.launch_reason,
        session.handoff_id,
        phase,
    );
    bus.publish(event);
}
