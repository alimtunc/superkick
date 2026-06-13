//! Background-session polling driver for `claude --bg` (subscription runner).
//!
//! The third spawn path, alongside the PTY supervisor (`lifecycle::run_supervised`)
//! and the structured adapters (`structured::consume`). `launch_claude_background`
//! (in [`super`]) starts the session and hands control here; [`run`] polls
//! `claude agents --json` for state, surfaces de-noised `claude logs` as
//! structured `EventKind::AgentProtocol` rows (so the cockpit Activity tab
//! renders them, not just raw scrollback in Logs), and produces the same
//! [`AgentResult`] the other paths return — so `RealStepRunner::process_completion`
//! (the business-state transition owner) is reused unchanged. The protocol rows
//! are intentionally synthetic and honest: `SessionMeta`/`Log`/`Completion`/
//! `Failure`/`Cancelled` only — never fabricated `ToolUse`/`ToolResult`.
//!
//! This task owns ONLY the [`AgentSession`] row and `run_events`. It never
//! mutates `Run` / `LaunchTaskStep` state.
//!
//! State → result mapping (consumed by the existing classifier):
//! - `working` / unknown → keep polling.
//! - `done`   → recover the `SUPERKICK_STEP_RESULT` marker from the **durable
//!   transcript** (`<config>/projects/*/<sessionId>.jsonl`), where it is byte-clean;
//!   the `claude logs` scrollback overdraws/evicts the marker and must not be the
//!   source of truth. Falls back to a scrollback scan only if the transcript
//!   can't be located. Success → completed; missing/malformed → needs-human.
//! - `blocked` → synthesized `NeedsHuman` `StepResult` (session left alive so a
//!   later `claude attach` takeover can resume it — that wiring is a follow-up).
//! - `failed`  → synthesized `Failed` `StepResult`.
//! - `stopped` (not via our cancel token) → `NeedsHuman` (resumable).

use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use chrono::Utc;
use tokio::time::{Instant, sleep, sleep_until};
use tokio_util::sync::CancellationToken;

use superkick_core::{
    AgentSession, AgentStatus, Cancelled, Completion, EventKind, EventLevel, Failure, LogEntry,
    LogLevel, ProtocolEvent, ProtocolEventEnvelope, ResumeKey, RunEvent, RunId,
    SessionLifecyclePhase, SessionMeta, StepId, StepResult, StepResultStatus,
};
use superkick_storage::repo::{AgentSessionRepo, RunEventRepo};

use crate::claude_background::{
    BackgroundFilter, BackgroundState, ClaudeBackgroundCli, denoise_log_lines,
    normalize_dedupe_key, transcript_assistant_text,
};
use crate::protocol_adapter::{MarkerError, StepResultScanner, TranscriptHints};
use crate::run_events::emit_built_event;
use crate::session_bus::SessionBus;

use super::{AgentResult, record_lifecycle};

/// Default cadence between `claude agents --json` polls.
pub const DEFAULT_POLL_INTERVAL: Duration = Duration::from_secs(2);

/// Consecutive "not in the agents list" polls tolerated before the session is
/// declared lost (daemon may have exited).
const MAX_CONSECUTIVE_MISSES: u32 = 5;

/// Consecutive poll errors tolerated before failing honestly.
const MAX_CONSECUTIVE_ERRORS: u32 = 3;

/// Max de-noised log lines surfaced as protocol rows per poll (flood guard).
const MAX_LOG_LINES_PER_POLL: usize = 30;

/// Cap on a single log-line protocol row.
const LOG_LINE_MAX_CHARS: usize = 300;

/// Bound on the dedupe set of already-surfaced log lines.
const SEEN_LOG_LINES_CAP: usize = 4000;

/// Emits `EventKind::AgentProtocol` rows (with a per-session monotonic envelope
/// `seq`) so the cockpit Activity tab renders structured background evidence
/// (`ProtocolActivityList`) instead of leaving raw scrollback in Logs only.
/// `claude --bg` has no real provider event stream, so these are intentionally
/// synthetic — limited to honest `SessionMeta`/`Log`/`Completion`/`Failure`/
/// `Cancelled` rows, never fabricated `ToolUse`/`ToolResult`.
struct ProtoEmitter {
    run_id: RunId,
    step_id: StepId,
    seq: u64,
}

impl ProtoEmitter {
    async fn emit<E: RunEventRepo>(
        &mut self,
        event_repo: &E,
        level: EventLevel,
        message: String,
        event: ProtocolEvent,
    ) {
        let envelope = ProtocolEventEnvelope {
            seq: self.seq,
            at: Utc::now(),
            event,
        };
        self.seq = self.seq.saturating_add(1);
        let mut ev = RunEvent::new(
            self.run_id,
            Some(self.step_id),
            EventKind::AgentProtocol,
            level,
            message,
        );
        ev.payload_json = serde_json::to_value(&envelope).ok();
        emit_built_event(event_repo, &ev, "background").await;
    }

    async fn log<E: RunEventRepo>(&mut self, event_repo: &E, level: LogLevel, message: String) {
        let ev_level = match level {
            LogLevel::Error => EventLevel::Error,
            LogLevel::Warn => EventLevel::Warn,
            LogLevel::Debug | LogLevel::Info => EventLevel::Info,
        };
        self.emit(
            event_repo,
            ev_level,
            message.clone(),
            ProtocolEvent::Log(LogEntry { level, message }),
        )
        .await;
    }
}

pub(crate) struct BackgroundDeps<S, E> {
    pub session_repo: Arc<S>,
    pub event_repo: Arc<E>,
    pub lifecycle_bus: Option<Arc<SessionBus>>,
}

/// Drive one background session to a terminal verdict. Returns the
/// [`AgentResult`] the step runner classifies; never mutates `Run`/step state.
pub(crate) async fn run<A, S, E>(
    cli: A,
    mut session: AgentSession,
    filter: BackgroundFilter,
    timeout: Duration,
    poll_interval: Duration,
    cancel: CancellationToken,
    deps: BackgroundDeps<S, E>,
) -> Result<AgentResult>
where
    A: ClaudeBackgroundCli,
    S: AgentSessionRepo + 'static,
    E: RunEventRepo + 'static,
{
    let run_id = session.run_id;
    let step_id = session.run_step_id;

    session.status = AgentStatus::Running;
    if let Err(e) = deps.session_repo.update(&session).await {
        tracing::warn!(session_id = %session.id, error = %e, "failed to mark background session running");
    }
    record_lifecycle(
        deps.lifecycle_bus.as_deref(),
        &*deps.event_repo,
        &session,
        SessionLifecyclePhase::Running,
    )
    .await;

    let mut proto = ProtoEmitter {
        run_id,
        step_id,
        seq: 0,
    };
    proto
        .emit(
            &*deps.event_repo,
            EventLevel::Info,
            format!("claude background session {} started", filter.id),
            ProtocolEvent::SessionMeta(SessionMeta {
                resume_key: ResumeKey::new(filter.id.clone()),
                label: Some(filter.name.clone()),
            }),
        )
        .await;

    let mut last_state: Option<BackgroundState> = None;
    let mut seen_log_lines: HashSet<String> = HashSet::new();
    let mut misses: u32 = 0;
    let mut errors: u32 = 0;
    let deadline = Instant::now() + timeout;

    let (terminal_phase, step_result) = loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                let _ = cli.stop(&filter.id).await;
                proto
                    .emit(
                        &*deps.event_repo,
                        EventLevel::Warn,
                        "claude background session cancelled by operator".into(),
                        ProtocolEvent::Cancelled(Cancelled {
                            reason: "cancelled by operator".into(),
                        }),
                    )
                    .await;
                break (SessionLifecyclePhase::Cancelled, Ok(None));
            }
            _ = sleep_until(deadline) => {
                let _ = cli.stop(&filter.id).await;
                proto
                    .emit(
                        &*deps.event_repo,
                        EventLevel::Warn,
                        "claude background session exceeded the wall-clock budget — stopped".into(),
                        ProtocolEvent::Failure(Failure {
                            code: "timeout".into(),
                            message: "exceeded the wall-clock budget".into(),
                            usage: None,
                        }),
                    )
                    .await;
                break (SessionLifecyclePhase::TimedOut, Ok(None));
            }
            _ = sleep(poll_interval) => {}
        }

        match cli.poll(&filter).await {
            Ok(Some(agent)) => {
                misses = 0;
                errors = 0;
                if last_state.as_ref() != Some(&agent.state) {
                    proto
                        .log(
                            &*deps.event_repo,
                            LogLevel::Info,
                            format!("background state: {}", describe_state(&agent.state)),
                        )
                        .await;
                    last_state = Some(agent.state.clone());
                }
                let logs = emit_new_log_lines(
                    &cli,
                    &filter.id,
                    &mut seen_log_lines,
                    &mut proto,
                    &*deps.event_repo,
                )
                .await;

                match &agent.state {
                    BackgroundState::Working | BackgroundState::Unknown(_) => continue,
                    BackgroundState::Blocked => {
                        proto
                            .log(
                                &*deps.event_repo,
                                LogLevel::Warn,
                                "background session blocked — needs human".into(),
                            )
                            .await;
                        break (
                            SessionLifecyclePhase::Completed { exit_code: 0 },
                            Ok(Some(blocked_result(logs.as_deref()))),
                        );
                    }
                    BackgroundState::Done => {
                        // Marker source of truth = the durable transcript, NOT the
                        // TUI scrollback (`claude logs` overdraws/evicts the marker,
                        // producing false "needs human"). Fall back to the scrollback
                        // scan only when the transcript can't be located.
                        let marker = match agent.session_id.as_deref() {
                            Some(sid) => match cli.transcript(sid).await {
                                Ok(Some(jsonl)) => scan_marker_from_transcript(&jsonl),
                                Ok(None) => scan_marker_from_logs(logs.as_deref()),
                                Err(e) => {
                                    proto
                                        .log(
                                            &*deps.event_repo,
                                            LogLevel::Warn,
                                            format!(
                                                "failed to read background transcript, scanning scrollback instead: {e}"
                                            ),
                                        )
                                        .await;
                                    scan_marker_from_logs(logs.as_deref())
                                }
                            },
                            None => scan_marker_from_logs(logs.as_deref()),
                        };
                        let summary = match &marker {
                            Ok(Some(sr)) => Some(sr.summary.clone()),
                            _ => None,
                        };
                        proto
                            .emit(
                                &*deps.event_repo,
                                EventLevel::Info,
                                "claude background session done".into(),
                                ProtocolEvent::Completion(Completion {
                                    summary,
                                    usage: None,
                                }),
                            )
                            .await;
                        break (SessionLifecyclePhase::Completed { exit_code: 0 }, marker);
                    }
                    BackgroundState::Failed => {
                        proto
                            .emit(
                                &*deps.event_repo,
                                EventLevel::Error,
                                "claude background session failed".into(),
                                ProtocolEvent::Failure(Failure {
                                    code: "claude_bg_failed".into(),
                                    message: "claude reported state: failed".into(),
                                    usage: None,
                                }),
                            )
                            .await;
                        break (
                            SessionLifecyclePhase::Failed {
                                exit_code: None,
                                reason: "claude background session reported state: failed".into(),
                            },
                            Ok(Some(failed_result(logs.as_deref()))),
                        );
                    }
                    BackgroundState::Stopped => {
                        // Our own cancel is handled in the `select!` arm above, so
                        // observing `stopped` here means an external stop. The
                        // conversation is kept, so park as resumable needs-human.
                        proto
                            .emit(
                                &*deps.event_repo,
                                EventLevel::Warn,
                                "claude background session stopped externally".into(),
                                ProtocolEvent::Cancelled(Cancelled {
                                    reason: "stopped externally (resumable)".into(),
                                }),
                            )
                            .await;
                        break (
                            SessionLifecyclePhase::Completed { exit_code: 0 },
                            Ok(Some(stopped_result())),
                        );
                    }
                }
            }
            Ok(None) => {
                misses += 1;
                if misses >= MAX_CONSECUTIVE_MISSES {
                    let message = format!(
                        "claude background session {} vanished from the agents list after {misses} polls (daemon may have exited)",
                        filter.id
                    );
                    proto
                        .emit(
                            &*deps.event_repo,
                            EventLevel::Error,
                            message.clone(),
                            ProtocolEvent::Failure(Failure {
                                code: "lost".into(),
                                message,
                                usage: None,
                            }),
                        )
                        .await;
                    break (
                        SessionLifecyclePhase::Failed {
                            exit_code: None,
                            reason: "background session lost from claude agents list".into(),
                        },
                        Ok(Some(lost_result())),
                    );
                }
            }
            Err(e) => {
                errors += 1;
                proto
                    .log(
                        &*deps.event_repo,
                        LogLevel::Warn,
                        format!(
                            "`claude agents --json` poll failed ({errors}/{MAX_CONSECUTIVE_ERRORS}): {e:#}"
                        ),
                    )
                    .await;
                if errors >= MAX_CONSECUTIVE_ERRORS {
                    let message = format!("claude agents poll failed {errors} times: {e:#}");
                    proto
                        .emit(
                            &*deps.event_repo,
                            EventLevel::Error,
                            message.clone(),
                            ProtocolEvent::Failure(Failure {
                                code: "poll_failed".into(),
                                message: message.clone(),
                                usage: None,
                            }),
                        )
                        .await;
                    break (
                        SessionLifecyclePhase::Failed {
                            exit_code: None,
                            reason: message,
                        },
                        Ok(Some(lost_result())),
                    );
                }
            }
        }
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
        tracing::warn!(session_id = %session.id, error = %e, "failed to finalize background session");
    }
    record_lifecycle(
        deps.lifecycle_bus.as_deref(),
        &*deps.event_repo,
        &session,
        terminal_phase.clone(),
    )
    .await;

    let timeout_after =
        matches!(terminal_phase, SessionLifecyclePhase::TimedOut).then_some(timeout);

    Ok(AgentResult {
        session,
        step_result,
        lifecycle_phase: terminal_phase,
        timeout_after,
        transcript_hints: TranscriptHints::default(),
        resume_key: None,
    })
}

/// Read `claude logs` best-effort, surface newly-seen de-noised lines as
/// protocol `Log` rows (capped per poll so a big snapshot can't flood Activity),
/// and return the raw logs for terminal marker extraction. A read failure
/// (ENOENT after daemon idle/restart) degrades to `None` — never fatal. The
/// `seen` set dedupes across polls, since `claude logs` re-renders the whole
/// scrollback each call rather than appending.
async fn emit_new_log_lines<A, E>(
    cli: &A,
    id: &str,
    seen: &mut HashSet<String>,
    proto: &mut ProtoEmitter,
    event_repo: &E,
) -> Option<String>
where
    A: ClaudeBackgroundCli,
    E: RunEventRepo,
{
    let raw = match cli.logs(id).await {
        Ok(Some(logs)) => logs,
        _ => return None,
    };
    let mut surfaced = 0;
    for line in denoise_log_lines(&raw) {
        if surfaced >= MAX_LOG_LINES_PER_POLL {
            break;
        }
        // Dedupe across polls by a counter/id-insensitive key — `claude logs`
        // re-renders the whole scrollback each call, so the same phrase recurs.
        if !seen.insert(normalize_dedupe_key(&line)) {
            continue;
        }
        proto
            .log(
                event_repo,
                LogLevel::Info,
                crate::text::tail_chars(&line, LOG_LINE_MAX_CHARS),
            )
            .await;
        surfaced += 1;
    }
    if seen.len() > SEEN_LOG_LINES_CAP {
        seen.clear();
    }
    Some(raw)
}

/// Scan terminal logs for the real step-result marker. `None` logs → `Ok(None)`
/// (→ `MissingMarker` → needs-human); a malformed closed block propagates as the
/// `MarkerError` the classifier renders as `MalformedMarker`.
fn scan_marker_from_logs(logs: Option<&str>) -> Result<Option<StepResult>, MarkerError> {
    match logs {
        Some(text) => {
            let mut scanner = StepResultScanner::new();
            scanner.feed(text.as_bytes())?;
            scanner.finish()
        }
        None => Ok(None),
    }
}

/// Scan the durable transcript for the step-result marker. Extracts the
/// assistant text (byte-clean — no TUI corruption) and runs the same
/// `StepResultScanner` the PTY/structured paths use, so the marker contract
/// can't drift. `Ok(None)` when no assistant text / no marker.
fn scan_marker_from_transcript(jsonl: &str) -> Result<Option<StepResult>, MarkerError> {
    let text = transcript_assistant_text(jsonl);
    if text.trim().is_empty() {
        return Ok(None);
    }
    let mut scanner = StepResultScanner::new();
    scanner.feed(text.as_bytes())?;
    scanner.finish()
}

fn with_log_tail(base: &str, logs: Option<&str>) -> String {
    match logs.map(str::trim).filter(|s| !s.is_empty()) {
        Some(tail) => format!(
            "{base}\n\nRecent background log tail:\n{}",
            crate::text::tail_chars(tail, 600)
        ),
        None => base.to_string(),
    }
}

fn blocked_result(logs: Option<&str>) -> StepResult {
    StepResult {
        status: StepResultStatus::NeedsHuman,
        summary: with_log_tail(
            "Claude background session is blocked (waiting for input or permission). \
             It was left running so it can be resumed; operator takeover via `claude attach` \
             is a follow-up.",
            logs,
        ),
        changed_files: Vec::new(),
        questions: Vec::new(),
    }
}

fn failed_result(logs: Option<&str>) -> StepResult {
    StepResult {
        status: StepResultStatus::Failed,
        summary: with_log_tail("Claude background session reported state: failed.", logs),
        changed_files: Vec::new(),
        questions: Vec::new(),
    }
}

fn stopped_result() -> StepResult {
    StepResult {
        status: StepResultStatus::NeedsHuman,
        summary: "Claude background session was stopped externally; the conversation is kept and \
                  remains resumable."
            .to_string(),
        changed_files: Vec::new(),
        questions: Vec::new(),
    }
}

fn lost_result() -> StepResult {
    StepResult {
        status: StepResultStatus::Failed,
        summary: "Lost the Claude background session — it is no longer in `claude agents` and the \
                  background daemon may have exited."
            .to_string(),
        changed_files: Vec::new(),
        questions: Vec::new(),
    }
}

fn describe_state(state: &BackgroundState) -> String {
    match state {
        BackgroundState::Working => "working".into(),
        BackgroundState::Blocked => "blocked".into(),
        BackgroundState::Done => "done".into(),
        BackgroundState::Failed => "failed".into(),
        BackgroundState::Stopped => "stopped".into(),
        BackgroundState::Unknown(s) => format!("unknown ({s})"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_marker_none_logs_is_missing_marker() {
        assert!(matches!(scan_marker_from_logs(None), Ok(None)));
    }

    #[test]
    fn scan_marker_extracts_valid_block() {
        let logs = "noise\nSUPERKICK_STEP_RESULT_BEGIN\n{\"status\":\"completed\",\"summary\":\"ok\",\"changed_files\":[],\"questions\":[]}\nSUPERKICK_STEP_RESULT_END\n";
        let sr = scan_marker_from_logs(Some(logs)).unwrap().expect("marker");
        assert_eq!(sr.status, StepResultStatus::Completed);
        assert_eq!(sr.summary, "ok");
    }

    #[test]
    fn blocked_and_stopped_park_needs_human() {
        assert_eq!(blocked_result(None).status, StepResultStatus::NeedsHuman);
        assert_eq!(stopped_result().status, StepResultStatus::NeedsHuman);
    }

    #[test]
    fn failed_and_lost_are_failed() {
        assert_eq!(failed_result(None).status, StepResultStatus::Failed);
        assert_eq!(lost_result().status, StepResultStatus::Failed);
    }

    #[test]
    fn blocked_result_appends_log_tail_when_present() {
        let sr = blocked_result(Some("waiting for your approval"));
        assert!(sr.summary.contains("waiting for your approval"));
    }
}
