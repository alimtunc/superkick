//! SUP-185 — structured (headless) spawn path for Codex Launch Task steps.
//!
//! The PTY supervisor (`lifecycle::run_supervised`) scrapes a terminal for the
//! `SUPERKICK_STEP_RESULT_*` marker. This path instead drives the existing
//! [`CodexProtocolAdapter`] (`codex exec --json`), drains its
//! `ProtocolEventEnvelope` stream, and:
//!
//! - persists each event as an `EventKind::AgentProtocol` `run_events` row
//!   (provider evidence — the storage layer assigns the per-run `seq`),
//! - coalesces streaming `TextDelta`s into one `TextBlock` row,
//! - captures the first `SessionMeta` into `agent_sessions.provider_session_id`,
//! - reuses [`StepResultScanner`] over the assistant text so the same marker
//!   contract produces the `StepResult`,
//! - returns the identical [`AgentResult`] shape the PTY path returns, so the
//!   step runner classifies the outcome and the executor owns the transition.
//!
//! It mutates only the `AgentSession` row and `run_events`; it never touches
//! `LaunchTaskStep` / `Run` business state.

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use chrono::{DateTime, Utc};
use tracing::warn;

use superkick_core::{
    AgentSession, AgentSessionId, AgentStatus, EventKind, EventLevel, LogLevel, ProtocolEvent,
    ProtocolEventEnvelope, ResumeKey, RunEvent, RunId, SessionLifecyclePhase, StepId, StepResult,
    TextBlock, TranscriptChunk, TurnOutcome,
};
use superkick_storage::repo::{AgentSessionRepo, RunEventRepo, TranscriptRepo};

use super::{AgentResult, record_lifecycle};
use crate::protocol_adapter::{MarkerError, ProtocolStream, StepResultScanner, TranscriptHints};
use crate::session_bus::SessionBus;
use crate::step_engine::emit_event;
use crate::text::truncate_chars;

/// Repos + bus the structured consume task needs, cloned out of the supervisor.
pub(crate) struct StructuredDeps<S, E, T> {
    pub session_repo: Arc<S>,
    pub event_repo: Arc<E>,
    pub transcript_repo: Arc<T>,
    pub lifecycle_bus: Option<Arc<SessionBus>>,
}

/// Drive one Codex structured turn to completion: drain the protocol stream,
/// persist evidence, and build the terminal `AgentResult`. Runs as the task
/// behind the `JoinHandle` returned by `AgentSupervisor::launch_codex_structured`.
pub(crate) async fn consume<S, E, T>(
    stream: ProtocolStream,
    mut session: AgentSession,
    timeout: Duration,
    idle_timeout: Option<Duration>,
    deps: StructuredDeps<S, E, T>,
) -> Result<AgentResult>
where
    S: AgentSessionRepo + 'static,
    E: RunEventRepo + 'static,
    T: TranscriptRepo + 'static,
{
    let ProtocolStream { mut events, handle } = stream;
    let run_id = session.run_id;
    let run_step_id = session.run_step_id;

    session.status = AgentStatus::Running;
    if let Err(e) = deps.session_repo.update(&session).await {
        warn!(session_id = %session.id, error = %e, "failed to mark structured session running");
    }
    record_lifecycle(
        deps.lifecycle_bus.as_deref(),
        &*deps.event_repo,
        &session,
        SessionLifecyclePhase::Running,
    )
    .await;
    emit_event(
        &*deps.event_repo,
        run_id,
        Some(run_step_id),
        EventKind::AgentOutput,
        EventLevel::Info,
        format!("codex structured turn started ({})", session.provider),
    )
    .await;

    let mut sink = StructuredEventSink::new(
        Arc::clone(&deps.event_repo),
        Arc::clone(&deps.session_repo),
        run_id,
        run_step_id,
        session.id,
    );

    // No-output watchdog: each event resets the idle window; a window that
    // elapses with no event means a hung-but-alive turn → kill it.
    let mut idle_tripped = false;
    loop {
        let next = match idle_timeout {
            Some(idle) => match tokio::time::timeout(idle, events.recv()).await {
                Ok(ev) => ev,
                Err(_elapsed) => {
                    idle_tripped = true;
                    break;
                }
            },
            None => events.recv().await,
        };
        match next {
            Some(envelope) => sink.ingest(envelope).await,
            None => break, // stream closed — child exited
        }
    }
    sink.flush_text().await;

    let (terminal_phase, timeout_after) = if idle_tripped {
        let idle = idle_timeout.unwrap_or_default();
        handle.cancel();
        let _ = handle.finish().await; // reap the killed child
        emit_event(
            &*deps.event_repo,
            run_id,
            Some(run_step_id),
            EventKind::Error,
            EventLevel::Error,
            super::no_output_watchdog_message(session.provider, idle),
        )
        .await;
        (SessionLifecyclePhase::TimedOut, Some(idle))
    } else {
        let outcome = handle.finish().await;
        map_outcome(&outcome, timeout)
    };

    match &terminal_phase {
        SessionLifecyclePhase::Completed { exit_code } => {
            session.status = AgentStatus::Completed;
            session.exit_code = Some(*exit_code);
        }
        SessionLifecyclePhase::Failed { exit_code, .. } => {
            session.status = AgentStatus::Failed;
            session.exit_code = *exit_code;
        }
        SessionLifecyclePhase::TimedOut => session.status = AgentStatus::Failed,
        SessionLifecyclePhase::Cancelled => session.status = AgentStatus::Cancelled,
        SessionLifecyclePhase::Spawning | SessionLifecyclePhase::Running => {}
    }
    session.finished_at = Some(Utc::now());
    if let Err(e) = deps.session_repo.update(&session).await {
        warn!(session_id = %session.id, error = %e, "failed to finalize structured session");
    }
    record_lifecycle(
        deps.lifecycle_bus.as_deref(),
        &*deps.event_repo,
        &session,
        terminal_phase.clone(),
    )
    .await;

    let (step_result, transcript, resume_key) = sink.finish();
    if !transcript.is_empty() {
        let chunk = TranscriptChunk::new(run_id, 0, transcript.into_bytes());
        if let Err(e) = deps.transcript_repo.insert(&chunk).await {
            warn!(run_id = %run_id, error = %e, "failed to persist codex structured transcript");
        }
    }

    Ok(AgentResult {
        session,
        step_result,
        lifecycle_phase: terminal_phase,
        timeout_after,
        // Codex transcript-hint patterns are stubbed (TODO SUP-140); the
        // classifier falls back to the marker outcome + terminal phase.
        transcript_hints: TranscriptHints::default(),
        resume_key,
    })
}

/// Map the adapter's terminal `TurnOutcome` to a session lifecycle phase. A
/// `timeout` failure (see `protocol_adapter::process::emit_terminal`) becomes
/// `TimedOut` so the classifier renders `Timeout { after }`.
fn map_outcome(
    outcome: &Result<TurnOutcome>,
    timeout: Duration,
) -> (SessionLifecyclePhase, Option<Duration>) {
    match outcome {
        Ok(TurnOutcome::Completed { .. }) => {
            (SessionLifecyclePhase::Completed { exit_code: 0 }, None)
        }
        Ok(TurnOutcome::Failed { code, .. }) if code == "timeout" => {
            (SessionLifecyclePhase::TimedOut, Some(timeout))
        }
        Ok(TurnOutcome::Failed { code, message, .. }) => (
            SessionLifecyclePhase::Failed {
                exit_code: Some(1),
                reason: format!("{code}: {message}"),
            },
            None,
        ),
        Ok(TurnOutcome::Cancelled { .. }) => (SessionLifecyclePhase::Cancelled, None),
        Err(e) => (
            SessionLifecyclePhase::Failed {
                exit_code: None,
                reason: format!("codex adapter error: {e:#}"),
            },
            None,
        ),
    }
}

/// A streaming `TextDelta` block held back until the block closes, so the
/// ledger stores one coalesced `TextBlock` row rather than every delta.
struct PendingText {
    block_id: String,
    text: String,
    seq: u64,
    at: DateTime<Utc>,
}

/// Persists protocol events as `run_events`, applies the volume policy
/// (coalesce text deltas), threads the resume key into the session, and
/// accumulates the assistant text for marker extraction + the raw transcript.
struct StructuredEventSink<E, A> {
    event_repo: Arc<E>,
    session_repo: Arc<A>,
    run_id: RunId,
    run_step_id: StepId,
    session_id: AgentSessionId,
    provider_session_set: bool,
    /// First `SessionMeta` resume key (Codex `thread_id`) seen on the stream,
    /// surfaced on the `AgentResult` so the executor can resume after a
    /// timeout (SUP-191).
    resume_key: Option<ResumeKey>,
    marker: StepResultScanner,
    transcript: String,
    pending: Option<PendingText>,
}

impl<E, A> StructuredEventSink<E, A>
where
    E: RunEventRepo,
    A: AgentSessionRepo,
{
    fn new(
        event_repo: Arc<E>,
        session_repo: Arc<A>,
        run_id: RunId,
        run_step_id: StepId,
        session_id: AgentSessionId,
    ) -> Self {
        Self {
            event_repo,
            session_repo,
            run_id,
            run_step_id,
            session_id,
            provider_session_set: false,
            resume_key: None,
            marker: StepResultScanner::new(),
            transcript: String::new(),
            pending: None,
        }
    }

    async fn ingest(&mut self, envelope: ProtocolEventEnvelope) {
        if let ProtocolEvent::TextDelta(delta) = &envelope.event {
            match &mut self.pending {
                Some(p) if p.block_id == delta.block_id => p.text.push_str(&delta.text),
                _ => {
                    self.flush_text().await;
                    self.pending = Some(PendingText {
                        block_id: delta.block_id.clone(),
                        text: delta.text.clone(),
                        seq: envelope.seq,
                        at: envelope.at,
                    });
                }
            }
            return;
        }

        // Any non-delta event closes an open text block first so the ledger
        // order matches the wire order.
        self.flush_text().await;

        match &envelope.event {
            ProtocolEvent::SessionMeta(meta) if !self.provider_session_set => {
                if let Err(e) = self
                    .session_repo
                    .set_provider_session_id(self.session_id, meta.resume_key.as_str())
                    .await
                {
                    warn!(session_id = %self.session_id, error = %e, "failed to persist provider_session_id");
                }
                self.resume_key = Some(meta.resume_key.clone());
                self.provider_session_set = true;
            }
            ProtocolEvent::TextBlock(block) => self.feed_text(&block.text),
            ProtocolEvent::Completion(completion) => {
                if let Some(summary) = &completion.summary {
                    self.feed_text(summary);
                }
            }
            _ => {}
        }

        self.persist(&envelope).await;
    }

    /// Feed assistant text to the marker scanner and the raw transcript.
    fn feed_text(&mut self, text: &str) {
        self.marker.feed(text.as_bytes());
        self.marker.feed(b"\n");
        if !self.transcript.is_empty() {
            self.transcript.push('\n');
        }
        self.transcript.push_str(text);
    }

    /// Flush a held-back text block as a single `TextBlock` `run_event`.
    async fn flush_text(&mut self) {
        let Some(PendingText {
            block_id,
            text,
            seq,
            at,
        }) = self.pending.take()
        else {
            return;
        };
        self.feed_text(&text);
        let envelope = ProtocolEventEnvelope {
            seq,
            at,
            event: ProtocolEvent::TextBlock(TextBlock { block_id, text }),
        };
        self.persist(&envelope).await;
    }

    async fn persist(&self, envelope: &ProtocolEventEnvelope) {
        let (level, message) = label(&envelope.event);
        let mut event = RunEvent::new(
            self.run_id,
            Some(self.run_step_id),
            EventKind::AgentProtocol,
            level,
            message,
        );
        event.payload_json = serde_json::to_value(envelope).ok();
        if let Err(e) = self.event_repo.insert(&event).await {
            warn!(run_id = %self.run_id, error = %e, "failed to persist codex protocol event");
        }
    }

    /// Consume the sink, returning the extracted `StepResult` (via the shared
    /// marker scanner), the accumulated raw transcript, and the captured
    /// resume key (Codex `thread_id`) if a `SessionMeta` was observed.
    fn finish(
        self,
    ) -> (
        Result<Option<StepResult>, MarkerError>,
        String,
        Option<ResumeKey>,
    ) {
        (self.marker.finish(), self.transcript, self.resume_key)
    }
}

/// Operator-facing `(level, message)` for a persisted protocol event. The full
/// envelope lives in `payload_json`; this is the at-a-glance ledger line.
fn label(event: &ProtocolEvent) -> (EventLevel, String) {
    match event {
        ProtocolEvent::SessionMeta(meta) => (
            EventLevel::Info,
            format!(
                "session: {}",
                meta.label
                    .as_deref()
                    .unwrap_or_else(|| meta.resume_key.as_str())
            ),
        ),
        ProtocolEvent::TextDelta(_) | ProtocolEvent::TextBlock(_) => {
            (EventLevel::Info, "agent message".to_string())
        }
        ProtocolEvent::Thinking(_) => (EventLevel::Debug, "thinking".to_string()),
        ProtocolEvent::Log(entry) => (level_of(entry.level), truncate_chars(&entry.message, 200)),
        ProtocolEvent::ToolUse(call) => (EventLevel::Info, format!("tool: {}", call.tool_name)),
        ProtocolEvent::ToolResult(result) => (
            if result.is_error {
                EventLevel::Warn
            } else {
                EventLevel::Info
            },
            format!(
                "tool result: {}",
                if result.is_error { "error" } else { "ok" }
            ),
        ),
        ProtocolEvent::Usage(_) => (EventLevel::Debug, "usage".to_string()),
        ProtocolEvent::Completion(_) => (EventLevel::Info, "completed".to_string()),
        ProtocolEvent::Failure(failure) => (EventLevel::Error, format!("failed: {}", failure.code)),
        ProtocolEvent::Cancelled(cancelled) => {
            (EventLevel::Warn, format!("cancelled: {}", cancelled.reason))
        }
    }
}

fn level_of(level: LogLevel) -> EventLevel {
    match level {
        LogLevel::Debug => EventLevel::Debug,
        LogLevel::Info => EventLevel::Info,
        LogLevel::Warn => EventLevel::Warn,
        LogLevel::Error => EventLevel::Error,
    }
}

#[cfg(test)]
mod tests {
    use std::process::Stdio;

    use tokio::io::AsyncWriteExt;
    use tokio::process::Command;

    use superkick_core::{
        AgentProvider, ExecutionMode, LaunchReason, LinearContextMode, Run, RunStep, RunnerMode,
        StepKey, StepResultStatus, StepStatus, TriggerSource,
    };
    use superkick_storage::repo::{
        AgentSessionRepo as _, RunEventRepo as _, RunRepo as _, RunStepRepo as _,
        TranscriptRepo as _,
    };
    use superkick_storage::{
        SqliteAgentSessionRepo, SqliteRunEventRepo, SqliteRunRepo, SqliteRunStepRepo,
        SqliteTranscriptRepo, connect_with_capacity,
    };

    use super::*;
    use crate::agent_supervisor::{
        AgentLaunchConfig, PolicyAudit, SessionLaunchInfo, build_agent_session,
    };
    use crate::protocol_adapter::spawn_codex_pump_for_test;

    // One `codex exec --json` turn: session id, a command tool call, an
    // unparseable line (must surface as a diagnostic, not vanish), the agent
    // message carrying the step-result marker, and a terminal usage/completion.
    const FIXTURE: &str = concat!(
        r#"{"type":"thread.started","thread_id":"thread-xyz"}"#,
        "\n",
        r#"{"type":"item.started","item":{"id":"item_0","type":"command_execution","command":"ls","aggregated_output":"","exit_code":null,"status":"in_progress"}}"#,
        "\n",
        r#"{"type":"item.completed","item":{"id":"item_0","type":"command_execution","command":"ls","aggregated_output":"ok\n","exit_code":0,"status":"completed"}}"#,
        "\n",
        "this is not valid json",
        "\n",
        r#"{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"SUPERKICK_STEP_RESULT_BEGIN\n{\"status\":\"completed\",\"summary\":\"did the thing\",\"changed_files\":[\"a.rs\"],\"questions\":[]}\nSUPERKICK_STEP_RESULT_END"}}"#,
        "\n",
        r#"{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":10}}"#,
        "\n",
    );

    async fn spawn_cat(fixture: &str) -> tokio::process::Child {
        let mut child = Command::new("cat")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("spawn cat");
        let mut stdin = child.stdin.take().expect("cat stdin");
        let payload = fixture.as_bytes().to_vec();
        tokio::spawn(async move {
            let _ = stdin.write_all(&payload).await;
        });
        child
    }

    #[tokio::test]
    async fn structured_flow_persists_events_marker_diagnostic_and_resume_key() {
        // Cap at one connection: each extra connection to `:memory:` opens its
        // own empty database and would hide writes from the reads below.
        let pool = connect_with_capacity("sqlite::memory:", 1)
            .await
            .expect("db");
        let run_repo = SqliteRunRepo::new(pool.clone());
        let step_repo = SqliteRunStepRepo::new(pool.clone());
        let event_repo = Arc::new(SqliteRunEventRepo::new(pool.clone()));
        let session_repo = Arc::new(SqliteAgentSessionRepo::new(pool.clone()));
        let transcript_repo = Arc::new(SqliteTranscriptRepo::new(pool.clone()));

        let run = Run::new(
            "T-1".into(),
            "T-1".into(),
            "owner/repo".into(),
            TriggerSource::LaunchTask,
            ExecutionMode::FullAuto,
            "main".into(),
            true,
            None,
        );
        let run_id = run.id;
        run_repo.insert(&run).await.expect("insert run");
        let mut step = RunStep::new(run_id, StepKey::Plan, 1);
        step.status = StepStatus::Running;
        step_repo.insert(&step).await.expect("insert step");

        let config = AgentLaunchConfig {
            run_id,
            step_id: step.id,
            provider: AgentProvider::Codex,
            args: vec!["codex".into(), "exec".into()],
            workdir: std::env::temp_dir(),
            timeout: Duration::from_secs(5),
            idle_timeout: None,
            linear_context_mode: LinearContextMode::None,
            policy_audit: PolicyAudit::default(),
            session_launch: SessionLaunchInfo {
                role: "coder".into(),
                purpose: "structured test".into(),
                parent_session_id: None,
                launch_reason: LaunchReason::InitialStep,
                handoff_id: None,
            },
            initial_stdin: None,
            runner_mode: RunnerMode::ExecJson,
            billing_profile: superkick_core::BillingProfile::default_for(
                AgentProvider::Codex,
                RunnerMode::ExecJson,
            ),
        };
        let session = build_agent_session(&config);
        let session_id = session.id;
        session_repo.insert(&session).await.expect("insert session");

        let child = spawn_cat(FIXTURE).await;
        let stream = spawn_codex_pump_for_test(child, 64, Some(Duration::from_secs(5)), None);
        let deps = StructuredDeps {
            session_repo: Arc::clone(&session_repo),
            event_repo: Arc::clone(&event_repo),
            transcript_repo: Arc::clone(&transcript_repo),
            lifecycle_bus: None,
        };

        let result = consume(stream, session, Duration::from_secs(5), None, deps)
            .await
            .expect("consume");

        // Terminal outcome + step result derived from the marker (reused scanner).
        assert!(matches!(
            result.lifecycle_phase,
            SessionLifecyclePhase::Completed { .. }
        ));
        let step_result = result.step_result.expect("marker parsed").expect("present");
        assert_eq!(step_result.status, StepResultStatus::Completed);
        assert_eq!(step_result.summary, "did the thing");
        assert_eq!(step_result.changed_files, vec!["a.rs".to_string()]);

        let events = event_repo.list_by_run(run_id).await.expect("events");

        // Deterministic ordering: a strictly increasing per-run seq across the
        // whole ledger (lifecycle + provider evidence interleaved).
        let seqs: Vec<u64> = events.iter().map(|e| e.seq).collect();
        assert!(
            seqs.windows(2).all(|w| w[0] < w[1]),
            "run_events seq must be strictly increasing for replay: {seqs:?}"
        );

        let protocol: Vec<_> = events
            .iter()
            .filter(|e| e.kind == EventKind::AgentProtocol)
            .collect();
        assert!(
            protocol.len() >= 6,
            "expected the provider-evidence rows (session/tool_use/tool_result/text/usage/completion), got {}",
            protocol.len()
        );

        // Invalid JSONL is a visible diagnostic, never silently dropped.
        assert!(
            events
                .iter()
                .any(|e| e.level == EventLevel::Warn && e.message.contains("unparseable")),
            "invalid Codex JSONL must persist a Warn diagnostic"
        );

        // SessionMeta.resume_key threaded into the session.
        let reloaded = session_repo
            .get(session_id)
            .await
            .expect("get session")
            .expect("session present");
        assert_eq!(reloaded.provider_session_id.as_deref(), Some("thread-xyz"));

        // Raw transcript fallback persisted for the shadow run.
        let transcript = transcript_repo
            .list_by_run(run_id)
            .await
            .expect("transcript");
        assert!(
            !transcript.is_empty(),
            "structured turn should persist a raw transcript chunk"
        );
    }

    #[tokio::test]
    async fn no_output_watchdog_kills_a_silent_turn() {
        let pool = connect_with_capacity("sqlite::memory:", 1)
            .await
            .expect("db");
        let run_repo = SqliteRunRepo::new(pool.clone());
        let step_repo = SqliteRunStepRepo::new(pool.clone());
        let event_repo = Arc::new(SqliteRunEventRepo::new(pool.clone()));
        let session_repo = Arc::new(SqliteAgentSessionRepo::new(pool.clone()));
        let transcript_repo = Arc::new(SqliteTranscriptRepo::new(pool.clone()));

        let run = Run::new(
            "T-IDLE".into(),
            "T-IDLE".into(),
            "owner/repo".into(),
            TriggerSource::LaunchTask,
            ExecutionMode::FullAuto,
            "main".into(),
            true,
            None,
        );
        let run_id = run.id;
        run_repo.insert(&run).await.expect("insert run");
        let mut step = RunStep::new(run_id, StepKey::Plan, 1);
        step.status = StepStatus::Running;
        step_repo.insert(&step).await.expect("insert step");

        let idle = Duration::from_millis(200);
        let config = AgentLaunchConfig {
            run_id,
            step_id: step.id,
            provider: AgentProvider::Codex,
            args: vec!["codex".into(), "exec".into()],
            workdir: std::env::temp_dir(),
            timeout: Duration::from_secs(30),
            idle_timeout: Some(idle),
            linear_context_mode: LinearContextMode::None,
            policy_audit: PolicyAudit::default(),
            session_launch: SessionLaunchInfo {
                role: "coder".into(),
                purpose: "idle watchdog test".into(),
                parent_session_id: None,
                launch_reason: LaunchReason::InitialStep,
                handoff_id: None,
            },
            initial_stdin: None,
            runner_mode: RunnerMode::ExecJson,
            billing_profile: superkick_core::BillingProfile::default_for(
                AgentProvider::Codex,
                RunnerMode::ExecJson,
            ),
        };
        let session = build_agent_session(&config);
        session_repo.insert(&session).await.expect("insert session");

        // A child that stays alive but emits nothing — the no-output watchdog
        // must terminate it well before the 30s wall-clock.
        let child = Command::new("sleep")
            .arg("30")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("spawn sleep");
        let stream = spawn_codex_pump_for_test(child, 64, Some(Duration::from_secs(30)), None);
        let deps = StructuredDeps {
            session_repo: Arc::clone(&session_repo),
            event_repo: Arc::clone(&event_repo),
            transcript_repo,
            lifecycle_bus: None,
        };

        let result = consume(stream, session, Duration::from_secs(30), Some(idle), deps)
            .await
            .expect("consume");

        assert!(
            matches!(result.lifecycle_phase, SessionLifecyclePhase::TimedOut),
            "a silent turn must hit the no-output watchdog, got {:?}",
            result.lifecycle_phase
        );
        assert_eq!(
            result.session.status,
            AgentStatus::Failed,
            "an idle-killed session is Failed"
        );

        let events = event_repo.list_by_run(run_id).await.expect("events");
        assert!(
            events
                .iter()
                .any(|e| e.level == EventLevel::Error && e.message.contains("no output")),
            "a readable no-output watchdog event must be persisted"
        );
    }
}
