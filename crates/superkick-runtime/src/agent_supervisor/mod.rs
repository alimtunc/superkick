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

pub(crate) fn no_output_watchdog_message(
    provider: superkick_core::AgentProvider,
    idle: std::time::Duration,
) -> String {
    format!(
        "agent {provider} produced no output for {idle:?} — terminated as hung (no-output watchdog)"
    )
}
pub(crate) mod output;
pub(crate) mod process;
pub(crate) mod structured;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use chrono::Utc;
use tokio_util::sync::CancellationToken;

use superkick_core::{
    AgentProvider, AgentSession, AgentSessionId, AgentStatus, BillingProfile, EventKind,
    EventLevel, HandoffId, LaunchReason, LinearContextMode, ResumeKey, RunEvent, RunId, RunnerMode,
    SessionLifecycleEvent, SessionLifecyclePhase, StepId, StepResult,
};
use superkick_storage::repo::{AgentSessionRepo, RunEventRepo, TranscriptRepo};

use crate::protocol_adapter::{MarkerError, TranscriptHints};
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
    /// Kill the process after this much output silence (hung-but-alive), reset
    /// on every output chunk and distinct from the total `timeout`. The Launch
    /// Task step runner sets it from `runner.agent_idle_timeout_secs`; `None`
    /// (every other spawn path) disables it.
    pub idle_timeout: Option<Duration>,
    /// How Linear context was delivered to this spawn. Recorded on the
    /// `AgentSession` so the run log makes the decision inspectable.
    pub linear_context_mode: LinearContextMode,
    /// Audit fields for the role's MCP and tool policy at spawn time
    /// (SUP-104). Persisted on the agent session so the run log answers
    /// "what could this child reach?" without re-deriving from config.
    pub policy_audit: PolicyAudit,
    /// Lineage + intent metadata (SUP-46).
    pub session_launch: SessionLaunchInfo,
    /// Prompt to write through the PTY master immediately after spawn,
    /// instead of appending it as a positional argv. `None` for headless
    /// modes that pass the prompt via `[--, prompt]`.
    pub initial_stdin: Option<String>,
    /// Audit-only; passed through to `agent_sessions.runner_mode`.
    pub runner_mode: RunnerMode,
    /// Audit-only; passed through to `agent_sessions.billing_profile`.
    pub billing_profile: BillingProfile,
}

/// Audit snapshot of the MCP + tool policy that was actually applied to
/// one spawn. Captured *after* any degradation (e.g. failed MCP file
/// write, Codex no-op) so the row reflects what the child actually saw.
#[derive(Debug, Clone, Default)]
pub struct PolicyAudit {
    /// Names of MCP servers wired into the child's `--mcp-config` file,
    /// or empty when no MCP file was generated.
    pub mcp_servers_used: Vec<String>,
    /// Snapshot of the role's tool allowlist; `None` when no allowlist was
    /// declared (no restriction).
    pub tools_allow_snapshot: Option<Vec<String>>,
    /// Operator-approval-per-tool-call flag from the resolved tool policy.
    pub tool_approval_required: bool,
    /// Whether tool result payloads are stored on the audit row.
    pub tool_results_persisted: bool,
}

/// Result of a completed agent session.
#[derive(Debug)]
pub struct AgentResult {
    pub session: AgentSession,
    /// Verdict from scanning the PTY output for the step result marker pair.
    pub step_result: Result<Option<StepResult>, MarkerError>,
    /// Terminal lifecycle phase recorded by the supervisor. The classifier
    /// (SUP-140) uses this to disambiguate timeout from clean exit when the
    /// marker is missing.
    pub lifecycle_phase: SessionLifecyclePhase,
    /// The wall-clock budget that elapsed when `lifecycle_phase ==
    /// TimedOut`; `None` for every other phase. The classifier turns this
    /// into `FailureClassification::Timeout { after }` so operators see the
    /// actual budget that was exceeded rather than a hard-coded zero.
    pub timeout_after: Option<std::time::Duration>,
    /// Free-form transcript hints (auth required, quota exhausted, tests
    /// failed) accumulated by the [`FailureHintScanner`]. Empty when the
    /// scanner observed nothing notable.
    ///
    /// [`FailureHintScanner`]: crate::protocol_adapter::FailureHintScanner
    pub transcript_hints: TranscriptHints,
    /// Codex `thread_id` (resume key) observed for this session, when the
    /// structured path captured a `SessionMeta` (SUP-191). Lets the Launch
    /// Task executor `codex exec resume` the same conversation after a
    /// mid-turn timeout. Always `None` on the PTY path, which has no
    /// resumable structured session.
    pub resume_key: Option<ResumeKey>,
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

    /// Construct a handle from its parts. Used by alternative spawn paths
    /// (e.g. the Codex structured step runner) that drive a child without the
    /// PTY supervisor but must return the same `(AgentHandle, JoinHandle)`
    /// shape so the step runner is path-agnostic.
    pub(crate) fn from_parts(session_id: AgentSessionId, cancel_token: CancellationToken) -> Self {
        Self {
            session_id,
            cancel_token,
        }
    }

    /// Construct a handle for unit tests that exercise registry/observation
    /// logic without spawning a real process.
    #[cfg(test)]
    pub fn for_tests(session_id: AgentSessionId, cancel_token: CancellationToken) -> Self {
        Self::from_parts(session_id, cancel_token)
    }
}

/// Build the `AgentSession` row from a launch config. Shared by the PTY
/// supervisor and the Codex structured step runner so the audit mapping
/// (role, purpose, policy snapshot, runner mode, billing) can't drift between
/// the two spawn paths. `provider_session_id` starts `None`; the structured
/// path fills it once the provider emits `SessionMeta`.
pub(crate) fn build_agent_session(config: &AgentLaunchConfig) -> AgentSession {
    AgentSession {
        id: AgentSessionId::new(),
        run_id: config.run_id,
        run_step_id: config.step_id,
        provider: config.provider,
        command: config.args.join(" "),
        pid: None,
        status: AgentStatus::Starting,
        started_at: Utc::now(),
        finished_at: None,
        exit_code: None,
        linear_context_mode: Some(config.linear_context_mode),
        mcp_servers_used: config.policy_audit.mcp_servers_used.clone(),
        tools_allow_snapshot: config.policy_audit.tools_allow_snapshot.clone(),
        tool_approval_required: config.policy_audit.tool_approval_required,
        tool_results_persisted: config.policy_audit.tool_results_persisted,
        role: Some(config.session_launch.role.clone()),
        purpose: Some(config.session_launch.purpose.clone()),
        parent_session_id: config.session_launch.parent_session_id,
        launch_reason: Some(config.session_launch.launch_reason),
        handoff_id: config.session_launch.handoff_id,
        provider_session_id: None,
        runner_mode: Some(config.runner_mode),
        billing_profile: Some(config.billing_profile),
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
        let session = build_agent_session(&config);
        let session_id = session.id;

        self.session_repo.insert(&session).await?;

        // Announce the session exists but hasn't yet been spawned. Observers
        // that care about "a new child is about to come online" pick this up
        // before the PTY is up; the ledger event surfaces it in the operator
        // orchestration thread.
        record_lifecycle(
            self.lifecycle_bus.as_deref(),
            &*self.event_repo,
            &session,
            SessionLifecyclePhase::Spawning,
        )
        .await;

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
            idle_timeout: config.idle_timeout,
        };

        let join = tokio::spawn(lifecycle::run_supervised(
            session,
            config.args,
            config.workdir,
            config.timeout,
            config.initial_stdin,
            cancel_token,
            deps,
        ));

        Ok((handle, join))
    }

    /// Launch a Codex step headlessly via `codex exec --json` (SUP-185).
    ///
    /// Symmetric with [`Self::launch`] — same `(AgentHandle, JoinHandle)`
    /// shape so the step runner is path-agnostic — but drives the
    /// [`CodexProtocolAdapter`](crate::protocol_adapter::CodexProtocolAdapter)
    /// instead of a PTY, persisting structured provider events into
    /// `run_events`. The returned task only mutates the `AgentSession` row and
    /// `run_events`; `LaunchTaskStep` / `Run` transitions stay owned by the
    /// executor that consumes the resulting `AgentResult`.
    ///
    /// `resume` carries the Codex `thread_id` from a prior timed-out segment
    /// (SUP-191): when `Some`, the turn is launched via `codex exec resume
    /// <id>` to continue the same conversation instead of starting fresh.
    pub async fn launch_codex_structured(
        &self,
        adapter: crate::protocol_adapter::CodexProtocolAdapter,
        config: AgentLaunchConfig,
        prompt: String,
        resume: Option<ResumeKey>,
    ) -> Result<(AgentHandle, tokio::task::JoinHandle<Result<AgentResult>>)> {
        use crate::protocol_adapter::ProtocolAdapter;
        use superkick_core::{TurnOptions, TurnRequest};

        let mut session = build_agent_session(&config);
        // Audit the real argv the adapter spawns (prompt is fed via stdin, so
        // it never appears here) rather than the unused PTY-style argv that
        // `build_launch_config` produced for this (Codex, ExecJson) step.
        session.command = adapter.command_preview(&config.workdir);
        let session_id = session.id;
        self.session_repo.insert(&session).await?;
        record_lifecycle(
            self.lifecycle_bus.as_deref(),
            &*self.event_repo,
            &session,
            SessionLifecyclePhase::Spawning,
        )
        .await;

        let timeout = config.timeout;
        let idle_timeout = config.idle_timeout;
        let request = TurnRequest {
            prompt,
            workdir: config.workdir.clone(),
            options: TurnOptions {
                timeout: Some(timeout),
                ..TurnOptions::default()
            },
        };

        // `start_turn`/`resume_turn` spawn the `codex` child; a spawn failure
        // surfaces here and the caller maps it via `classify_spawn_error`,
        // mirroring `launch`. `resume_turn` continues an existing thread via
        // `codex exec resume <id>` instead of starting a fresh session.
        let stream = match resume {
            Some(key) => adapter.resume_turn(key, request).await?,
            None => adapter.start_turn(request).await?,
        };
        let handle = AgentHandle::from_parts(session_id, stream.handle.cancel_token());

        let deps = structured::StructuredDeps {
            session_repo: Arc::clone(&self.session_repo),
            event_repo: Arc::clone(&self.event_repo),
            transcript_repo: Arc::clone(&self.transcript_repo),
            lifecycle_bus: self.lifecycle_bus.clone(),
        };
        let join = tokio::spawn(structured::consume(
            stream,
            session,
            timeout,
            idle_timeout,
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

/// Publish a lifecycle event to the bus **and** emit an operator-visible
/// RunEvent for ledger-worthy transitions. `Running` is intentionally skipped
/// because it fires immediately after `Spawning` and only signals PID
/// assignment — noisy, not story-relevant.
///
/// The RunEvent payload carries the lineage fields (`role`, `purpose`,
/// `parent_session_id`, `launch_reason`, `handoff_id`) plus exit/reason so
/// the operator ledger can reconstruct session lineage without a DB round-trip.
pub(crate) async fn record_lifecycle<E>(
    bus: Option<&SessionBus>,
    event_repo: &E,
    session: &AgentSession,
    phase: SessionLifecyclePhase,
) where
    E: RunEventRepo + ?Sized,
{
    publish_lifecycle(bus, session, phase.clone());

    let (kind, level, message, reason) = match &phase {
        SessionLifecyclePhase::Spawning => (
            EventKind::SessionSpawned,
            EventLevel::Info,
            format!(
                "session spawned: {} ({})",
                session.role.as_deref().unwrap_or("agent"),
                session.provider
            ),
            None,
        ),
        // `Running` is an internal PID-assignment signal; keep it off the ledger.
        SessionLifecyclePhase::Running => return,
        SessionLifecyclePhase::Completed { .. } => (
            EventKind::SessionCompleted,
            EventLevel::Info,
            format!(
                "session completed: {} ({})",
                session.role.as_deref().unwrap_or("agent"),
                session.provider
            ),
            None,
        ),
        SessionLifecyclePhase::Failed {
            exit_code, reason, ..
        } => (
            EventKind::SessionFailed,
            EventLevel::Error,
            format!(
                "session failed: {} ({}) exit={:?}",
                session.role.as_deref().unwrap_or("agent"),
                session.provider,
                exit_code
            ),
            Some(reason.clone()),
        ),
        SessionLifecyclePhase::Cancelled => (
            EventKind::SessionCancelled,
            EventLevel::Warn,
            format!(
                "session cancelled: {} ({})",
                session.role.as_deref().unwrap_or("agent"),
                session.provider
            ),
            None,
        ),
        SessionLifecyclePhase::TimedOut => (
            EventKind::SessionFailed,
            EventLevel::Warn,
            format!(
                "session timed out: {} ({})",
                session.role.as_deref().unwrap_or("agent"),
                session.provider
            ),
            Some("timeout".to_string()),
        ),
    };

    let payload = serde_json::json!({
        "session_id": session.id,
        "provider": session.provider,
        "role": session.role,
        "purpose": session.purpose,
        "parent_session_id": session.parent_session_id,
        "launch_reason": session.launch_reason,
        "handoff_id": session.handoff_id,
        "phase": phase,
        "exit_code": session.exit_code,
        "reason": reason,
    });

    let mut event = RunEvent::new(
        session.run_id,
        Some(session.run_step_id),
        kind,
        level,
        message,
    );
    event.payload_json = Some(payload);
    if let Err(e) = event_repo.insert(&event).await {
        tracing::warn!("failed to emit session lifecycle run event: {e}");
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use anyhow::Result;
    use chrono::Utc;
    use superkick_core::{
        AgentProvider, AgentSession, AgentSessionId, AgentStatus, EventId, EventKind, RunId,
        SessionLifecyclePhase, StepId,
    };
    use superkick_storage::repo::RunEventRepo;

    use super::*;

    /// Captures inserted RunEvents so tests can assert on the ledger writes
    /// without standing up a SQLite schema.
    struct CapturingRepo {
        events: Mutex<Vec<RunEvent>>,
    }

    impl CapturingRepo {
        fn new() -> Self {
            Self {
                events: Mutex::new(Vec::new()),
            }
        }

        fn snapshot(&self) -> Vec<RunEvent> {
            self.events.lock().unwrap().clone()
        }
    }

    impl RunEventRepo for CapturingRepo {
        async fn insert(&self, event: &RunEvent) -> Result<u64> {
            let mut events = self.events.lock().unwrap();
            let seq = events.len() as u64 + 1;
            events.push(event.clone());
            Ok(seq)
        }

        async fn get(&self, _id: EventId) -> Result<Option<RunEvent>> {
            Ok(None)
        }

        async fn list_by_run(&self, _run_id: RunId) -> Result<Vec<RunEvent>> {
            Ok(Vec::new())
        }

        async fn list_by_run_from_offset(
            &self,
            _run_id: RunId,
            _offset: usize,
        ) -> Result<Vec<RunEvent>> {
            Ok(Vec::new())
        }
    }

    fn test_session() -> AgentSession {
        AgentSession {
            id: AgentSessionId::new(),
            run_id: RunId::new(),
            run_step_id: StepId::new(),
            provider: AgentProvider::Claude,
            command: "claude plan".into(),
            pid: None,
            status: AgentStatus::Starting,
            started_at: Utc::now(),
            finished_at: None,
            exit_code: None,
            linear_context_mode: None,
            mcp_servers_used: Vec::new(),
            tools_allow_snapshot: None,
            tool_approval_required: false,
            tool_results_persisted: true,
            role: Some("planner".into()),
            purpose: Some("draft plan".into()),
            parent_session_id: None,
            launch_reason: Some(superkick_core::LaunchReason::InitialStep),
            handoff_id: None,
            provider_session_id: None,
            runner_mode: None,
            billing_profile: None,
        }
    }

    #[tokio::test]
    async fn spawning_emits_session_spawned_with_lineage_payload() {
        let repo = CapturingRepo::new();
        let session = test_session();

        record_lifecycle(None, &repo, &session, SessionLifecyclePhase::Spawning).await;

        let events = repo.snapshot();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, EventKind::SessionSpawned);
        let payload = events[0].payload_json.as_ref().expect("payload");
        assert_eq!(payload["role"], "planner");
        assert_eq!(payload["purpose"], "draft plan");
        assert_eq!(payload["session_id"], serde_json::json!(session.id));
    }

    #[tokio::test]
    async fn running_is_skipped_on_the_ledger() {
        let repo = CapturingRepo::new();
        let session = test_session();

        record_lifecycle(None, &repo, &session, SessionLifecyclePhase::Running).await;

        assert!(
            repo.snapshot().is_empty(),
            "Running phase is noise and must not reach the ledger"
        );
    }

    #[tokio::test]
    async fn completed_failed_cancelled_and_timeout_each_emit_once() {
        let repo = CapturingRepo::new();
        let session = test_session();

        record_lifecycle(
            None,
            &repo,
            &session,
            SessionLifecyclePhase::Completed { exit_code: 0 },
        )
        .await;
        record_lifecycle(
            None,
            &repo,
            &session,
            SessionLifecyclePhase::Failed {
                exit_code: Some(2),
                reason: "bad config".into(),
            },
        )
        .await;
        record_lifecycle(None, &repo, &session, SessionLifecyclePhase::Cancelled).await;
        record_lifecycle(None, &repo, &session, SessionLifecyclePhase::TimedOut).await;

        let events = repo.snapshot();
        let kinds: Vec<EventKind> = events.iter().map(|e| e.kind).collect();
        assert_eq!(
            kinds,
            vec![
                EventKind::SessionCompleted,
                EventKind::SessionFailed,
                EventKind::SessionCancelled,
                EventKind::SessionFailed,
            ]
        );
        // The TimedOut variant is mapped to SessionFailed with reason=timeout so
        // operators still see "this session did not succeed" without an extra
        // EventKind for every terminal flavour.
        let timeout_payload = events[3].payload_json.as_ref().expect("timeout payload");
        assert_eq!(timeout_payload["reason"], "timeout");
    }
}
