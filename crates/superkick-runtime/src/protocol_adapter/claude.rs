//! Claude Code protocol adapter — runs `claude --print --output-format stream-json`
//! and translates the NDJSON event stream into canonical `ProtocolEvent`s.
//!
//! The adapter spawns the Claude CLI directly via `tokio::process::Command`,
//! writes a single user message on stdin (then closes it for one-shot turns),
//! and pumps stdout / stderr concurrently against the cancellation token. The
//! existing PTY supervisor (`agent_supervisor::lifecycle`) is untouched and
//! continues to drive terminal-takeover today; this adapter is the structured
//! alternative the orchestrator can switch over to in a follow-up ticket.
//!
//! Scope is intentionally narrow: no policy ledger, no MCP wiring beyond a
//! `--mcp-config` path, no streaming partial messages. The contract from
//! SUP-97 is what consumers see.

use std::collections::VecDeque;
use std::future::Future;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::Utc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::time::{Instant, timeout};
use tokio_util::sync::CancellationToken;
use tracing::{debug, info, warn};

use superkick_core::{
    Cancelled, Failure, ProtocolEvent, ProtocolEventEnvelope, ResumeKey, TurnOutcome, TurnRequest,
};

use super::claude_stream::{ParserState, parse_line};
use super::{
    ProtocolAdapter, ProtocolEventSender, ProtocolStream, TurnHandle, protocol_event_channel,
};

/// Permission mode forwarded to Claude via `--permission-mode`. The default
/// matches the existing PTY supervisor's `--dangerously-skip-permissions`
/// posture so the structured backend has parity for autonomous runs.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum ClaudePermissionMode {
    #[default]
    BypassPermissions,
    AcceptEdits,
    Plan,
    Default,
}

impl ClaudePermissionMode {
    fn as_arg(self) -> &'static str {
        match self {
            Self::BypassPermissions => "bypassPermissions",
            Self::AcceptEdits => "acceptEdits",
            Self::Plan => "plan",
            Self::Default => "default",
        }
    }
}

/// Provider-specific knobs for `ClaudeProtocolAdapter`. The SUP-97 trait
/// contract intentionally bans these from `TurnOptions` — they are Claude-only
/// extensions that the orchestrator passes when selecting this adapter.
#[derive(Debug, Clone)]
pub struct ClaudeAdapterOptions {
    /// Path to the `claude` executable. `None` = look up `claude` on PATH.
    pub claude_executable: Option<PathBuf>,
    /// Per-role MCP config written by `mcp_policy::write_role_mcp_config`.
    /// When set, the adapter appends `--mcp-config <path> --strict-mcp-config`
    /// so the child cannot silently fall back to the user's home config.
    pub mcp_config: Option<PathBuf>,
    /// Optional model alias forwarded as `--model <value>`. Falls back to the
    /// CLI's own default when `None`.
    pub model: Option<String>,
    /// Optional system prompt forwarded as `--system-prompt`.
    pub system_prompt: Option<String>,
    /// Permission posture. Defaults to `bypassPermissions` for parity with
    /// the existing PTY supervisor.
    pub permission_mode: ClaudePermissionMode,
    /// Maximum number of stderr lines kept in the rolling buffer used to
    /// enrich `Failure.message` when Claude exits non-zero without a
    /// `result` event. 64 covers typical Node stack traces; bump if a real
    /// trace is consistently truncated.
    pub stderr_tail_lines: usize,
}

impl Default for ClaudeAdapterOptions {
    fn default() -> Self {
        Self {
            claude_executable: None,
            mcp_config: None,
            model: None,
            system_prompt: None,
            permission_mode: ClaudePermissionMode::default(),
            stderr_tail_lines: 64,
        }
    }
}

/// Provider-neutral adapter that drives Claude Code's `stream-json` mode.
#[derive(Debug, Clone, Default)]
pub struct ClaudeProtocolAdapter {
    options: ClaudeAdapterOptions,
}

impl ClaudeProtocolAdapter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_options(options: ClaudeAdapterOptions) -> Self {
        Self { options }
    }

    pub fn options(&self) -> &ClaudeAdapterOptions {
        &self.options
    }

    fn spawn(&self, request: TurnRequest, resume: Option<ResumeKey>) -> Result<ProtocolStream> {
        let argv = build_argv(&self.options, resume.as_ref());
        let executable = self
            .options
            .claude_executable
            .clone()
            .unwrap_or_else(|| PathBuf::from("claude"));

        // Argv preview: log everything but the prompt (the prompt is on stdin,
        // not argv, so this is the full surface). Mirrors agent_supervisor's
        // logging convention; mcp-config path is included but the file
        // contents are deliberately not.
        info!(
            executable = %executable.display(),
            argv = ?argv,
            workdir = %request.workdir.display(),
            "claude protocol adapter argv (prompt elided)",
        );

        let mut command = Command::new(&executable);
        command
            .args(&argv)
            .current_dir(&request.workdir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        let mut child = command
            .spawn()
            .with_context(|| format!("spawn claude executable {}", executable.display()))?;

        let stdin = child.stdin.take().context("claude child has no stdin")?;
        let prompt = request.prompt.clone();
        tokio::spawn(async move {
            if let Err(err) = write_initial_prompt(stdin, &prompt).await {
                warn!(error = %err, "failed to write claude stdin prompt");
            }
        });

        let pump_options = PumpOptions {
            stderr_tail_lines: self.options.stderr_tail_lines,
            timeout: request.options.timeout,
        };

        Ok(spawn_pump(child, pump_options))
    }
}

impl ProtocolAdapter for ClaudeProtocolAdapter {
    fn name(&self) -> &'static str {
        "claude"
    }

    fn start_turn(
        &self,
        request: TurnRequest,
    ) -> impl Future<Output = Result<ProtocolStream>> + Send {
        let result = self.spawn(request, None);
        async move { result }
    }

    fn resume_turn(
        &self,
        resume_key: ResumeKey,
        request: TurnRequest,
    ) -> impl Future<Output = Result<ProtocolStream>> + Send {
        let result = self.spawn(request, Some(resume_key));
        async move { result }
    }
}

/// Build the argv (excluding the executable itself) for a turn. Public-to-crate
/// so unit tests can pin the order of flags.
pub(crate) fn build_argv(
    options: &ClaudeAdapterOptions,
    resume: Option<&ResumeKey>,
) -> Vec<String> {
    let mut argv = vec![
        "--print".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--input-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
        "--permission-mode".to_string(),
        options.permission_mode.as_arg().to_string(),
    ];

    if let Some(path) = &options.mcp_config {
        argv.push("--mcp-config".to_string());
        argv.push(path.to_string_lossy().into_owned());
        argv.push("--strict-mcp-config".to_string());
    }

    if let Some(model) = &options.model {
        argv.push("--model".to_string());
        argv.push(model.clone());
    }

    if let Some(prompt) = &options.system_prompt {
        argv.push("--system-prompt".to_string());
        argv.push(prompt.clone());
    }

    if let Some(key) = resume {
        argv.push("--resume".to_string());
        argv.push(key.as_str().to_string());
    }

    argv
}

async fn write_initial_prompt(mut stdin: tokio::process::ChildStdin, prompt: &str) -> Result<()> {
    let envelope = serde_json::json!({
        "type": "user",
        "message": {
            "role": "user",
            "content": [{ "type": "text", "text": prompt }],
        },
    });
    let mut bytes = serde_json::to_vec(&envelope).context("encode claude stdin user message")?;
    bytes.push(b'\n');
    stdin
        .write_all(&bytes)
        .await
        .context("write claude stdin user message")?;
    stdin
        .shutdown()
        .await
        .context("close claude stdin (one-shot turn)")?;
    Ok(())
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct PumpOptions {
    pub stderr_tail_lines: usize,
    pub timeout: Option<Duration>,
}

/// Construct a `ProtocolStream` from an already-spawned child. Spawns the pump
/// task and returns immediately. Public-to-crate so the integration tests can
/// drive the same machinery with a mock `cat`-based child.
pub(crate) fn spawn_pump(child: Child, options: PumpOptions) -> ProtocolStream {
    let (tx, rx) = protocol_event_channel();
    let cancel = CancellationToken::new();
    let cancel_for_task = cancel.clone();

    let outcome = tokio::spawn(async move { pump(child, options, tx, cancel_for_task).await });

    ProtocolStream {
        events: rx,
        handle: TurnHandle::new(cancel, outcome),
    }
}

async fn pump(
    mut child: Child,
    options: PumpOptions,
    tx: ProtocolEventSender,
    cancel: CancellationToken,
) -> Result<TurnOutcome> {
    let stdout = child
        .stdout
        .take()
        .context("claude child missing stdout pipe")?;
    let stderr = child
        .stderr
        .take()
        .context("claude child missing stderr pipe")?;

    let mut stdout_lines = BufReader::new(stdout).lines();
    let mut stderr_lines = BufReader::new(stderr).lines();

    let seq = AtomicU64::new(0);
    let mut state = ParserState::default();
    let mut completion_outcome: Option<TurnOutcome> = None;
    let mut stderr_tail: VecDeque<String> = VecDeque::with_capacity(options.stderr_tail_lines);
    let mut stdout_done = false;
    let mut stderr_done = false;

    let timeout_dur = options.timeout;
    // Single wall-clock deadline anchored once at pump start. Re-creating a
    // `sleep(d)` future inside the `select!` would reset the timer every
    // iteration, so a steady stream of events would silently dodge the cap.
    let deadline = timeout_dur.map(|d| Instant::now() + d);

    loop {
        if stdout_done && stderr_done {
            break;
        }
        // If we already published a terminal event from stdout, stop pumping;
        // we don't need to wait for stderr EOF to propagate the outcome.
        if completion_outcome.is_some() && stdout_done {
            break;
        }
        let timeout_branch = async {
            match deadline {
                Some(deadline) => tokio::time::sleep_until(deadline).await,
                None => std::future::pending::<()>().await,
            }
        };

        tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                warn!("claude protocol turn cancelled by operator");
                kill_with_grace(&mut child).await;
                drain_remaining_stdout(
                    &mut stdout_lines,
                    &mut state,
                    &tx,
                    &seq,
                    &mut completion_outcome,
                ).await;
                let outcome = emit_terminal(
                    &tx,
                    &seq,
                    Termination::Cancelled,
                    state.last_resume_key.clone(),
                    timeout_dur,
                    &stderr_tail,
                ).await;
                return Ok(outcome);
            }
            _ = timeout_branch => {
                warn!(?timeout_dur, "claude protocol turn timed out");
                kill_with_grace(&mut child).await;
                drain_remaining_stdout(
                    &mut stdout_lines,
                    &mut state,
                    &tx,
                    &seq,
                    &mut completion_outcome,
                ).await;
                let outcome = emit_terminal(
                    &tx,
                    &seq,
                    Termination::Timeout,
                    state.last_resume_key.clone(),
                    timeout_dur,
                    &stderr_tail,
                ).await;
                return Ok(outcome);
            }
            line = stdout_lines.next_line(), if !stdout_done => {
                match line {
                    Ok(Some(text)) => {
                        process_stdout_line(
                            &text,
                            &mut state,
                            &tx,
                            &seq,
                            &mut completion_outcome,
                        ).await;
                    }
                    Ok(None) => stdout_done = true,
                    Err(err) => {
                        warn!(error = %err, "claude stdout read error");
                        stdout_done = true;
                    }
                }
            }
            line = stderr_lines.next_line(), if !stderr_done => {
                match line {
                    Ok(Some(text)) => append_stderr_tail(
                        &mut stderr_tail,
                        options.stderr_tail_lines,
                        text,
                    ),
                    Ok(None) => stderr_done = true,
                    Err(err) => {
                        warn!(error = %err, "claude stderr read error");
                        stderr_done = true;
                    }
                }
            }
        }
    }

    if let Some(outcome) = completion_outcome {
        // We saw a terminal event; the child may still be running but we don't
        // need its exit code. `kill_on_drop(true)` will reap it as `child` falls
        // out of scope.
        return Ok(outcome);
    }

    let exit = child.wait().await.context("await claude child exit")?;
    let exit_code = exit.code().unwrap_or(-1);
    let tail = stderr_tail
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join("\n");
    let code = format!("claude_exit_{exit_code}");
    let message = if tail.is_empty() {
        format!("claude exited with code {exit_code}")
    } else {
        format!("claude exited with code {exit_code}: {tail}")
    };

    send_event(
        &tx,
        &seq,
        ProtocolEvent::Failure(Failure {
            code: code.clone(),
            message: message.clone(),
            usage: None,
        }),
    )
    .await;

    Ok(TurnOutcome::Failed {
        resume_key: state.last_resume_key,
        code,
        message,
    })
}

async fn process_stdout_line(
    line: &str,
    state: &mut ParserState,
    tx: &ProtocolEventSender,
    seq: &AtomicU64,
    completion_outcome: &mut Option<TurnOutcome>,
) {
    let events = parse_line(line, state);
    for event in events {
        let terminal_outcome = match &event {
            ProtocolEvent::Completion(c) => Some(TurnOutcome::Completed {
                resume_key: state
                    .last_resume_key
                    .clone()
                    .unwrap_or_else(|| ResumeKey::new("")),
                usage: c.usage.clone(),
            }),
            ProtocolEvent::Failure(f) => Some(TurnOutcome::Failed {
                resume_key: state.last_resume_key.clone(),
                code: f.code.clone(),
                message: f.message.clone(),
            }),
            _ => None,
        };

        send_event(tx, seq, event).await;

        if let Some(outcome) = terminal_outcome {
            // First terminal event wins. The pump loop will see
            // `completion_outcome.is_some()` and exit on its next tick, so any
            // events still in this `parse_line` batch would be discarded —
            // bail now so we don't emit them out of contract order.
            *completion_outcome = Some(outcome);
            return;
        }
    }
}

async fn drain_remaining_stdout(
    stdout_lines: &mut tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
    state: &mut ParserState,
    tx: &ProtocolEventSender,
    seq: &AtomicU64,
    completion_outcome: &mut Option<TurnOutcome>,
) {
    // Best-effort: read whatever Claude already buffered to stdout before we
    // killed it, with a tight ceiling so a truly stuck child can't hold the
    // pump open. 50 ms per line is more than enough on a closed pipe.
    while let Ok(Ok(Some(text))) =
        timeout(Duration::from_millis(50), stdout_lines.next_line()).await
    {
        process_stdout_line(&text, state, tx, seq, completion_outcome).await;
    }
}

fn append_stderr_tail(tail: &mut VecDeque<String>, capacity: usize, line: String) {
    if capacity == 0 {
        return;
    }
    if tail.len() == capacity {
        tail.pop_front();
    }
    tail.push_back(line);
}

#[derive(Debug)]
enum Termination {
    Cancelled,
    Timeout,
}

const CANCEL_REASON_OPERATOR: &str = "operator";

async fn emit_terminal(
    tx: &ProtocolEventSender,
    seq: &AtomicU64,
    termination: Termination,
    resume_key: Option<ResumeKey>,
    timeout_dur: Option<Duration>,
    stderr_tail: &VecDeque<String>,
) -> TurnOutcome {
    match termination {
        Termination::Cancelled => {
            send_event(
                tx,
                seq,
                ProtocolEvent::Cancelled(Cancelled {
                    reason: CANCEL_REASON_OPERATOR.to_string(),
                }),
            )
            .await;
            TurnOutcome::Cancelled {
                resume_key,
                reason: CANCEL_REASON_OPERATOR.to_string(),
            }
        }
        Termination::Timeout => {
            let mut message = match timeout_dur {
                Some(d) => format!("claude turn timed out after {d:?}"),
                None => "claude turn timed out".to_string(),
            };
            if !stderr_tail.is_empty() {
                let tail = stderr_tail
                    .iter()
                    .map(String::as_str)
                    .collect::<Vec<_>>()
                    .join("\n");
                message.push_str(": ");
                message.push_str(&tail);
            }
            let code = "timeout".to_string();
            send_event(
                tx,
                seq,
                ProtocolEvent::Failure(Failure {
                    code: code.clone(),
                    message: message.clone(),
                    usage: None,
                }),
            )
            .await;
            TurnOutcome::Failed {
                resume_key,
                code,
                message,
            }
        }
    }
}

async fn kill_with_grace(child: &mut Child) {
    let pid = match child.id() {
        Some(pid) => pid,
        None => return,
    };

    // SIGTERM first — gives Claude a chance to flush its final result line.
    // SAFETY: `libc::kill` with a non-negative pid sends a signal to a single
    // process. The pid came straight from this child handle, so the call is
    // bounded to the child we own.
    unsafe {
        libc::kill(pid as i32, libc::SIGTERM);
    }

    if matches!(
        timeout(Duration::from_secs(2), child.wait()).await,
        Ok(Ok(_))
    ) {
        return;
    }

    debug!(
        pid,
        "claude child did not exit within 2s of SIGTERM, sending SIGKILL"
    );
    if let Err(err) = child.start_kill() {
        warn!(error = %err, "claude start_kill failed");
    }
    let _ = timeout(Duration::from_secs(1), child.wait()).await;
}

async fn send_event(tx: &ProtocolEventSender, seq: &AtomicU64, event: ProtocolEvent) {
    let envelope = ProtocolEventEnvelope {
        seq: seq.fetch_add(1, Ordering::Relaxed),
        at: Utc::now(),
        event,
    };
    if let Err(err) = tx.send(envelope).await {
        debug!(
            error = %err,
            "claude protocol consumer dropped the event receiver",
        );
    }
}

/// Test seam: spawn the pump task against an externally-built `Child` so the
/// integration test can use a POSIX `cat <fixture>` mock instead of a real
/// claude binary. Not part of the public API.
#[doc(hidden)]
pub fn spawn_pump_for_test(
    child: Child,
    stderr_tail_lines: usize,
    timeout: Option<Duration>,
) -> ProtocolStream {
    spawn_pump(
        child,
        PumpOptions {
            stderr_tail_lines,
            timeout,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_argv_includes_required_stream_flags() {
        let argv = build_argv(&ClaudeAdapterOptions::default(), None);
        assert!(argv.iter().any(|a| a == "--print"));
        let pos = argv
            .iter()
            .position(|a| a == "--output-format")
            .expect("output-format flag");
        assert_eq!(argv[pos + 1], "stream-json");
        let pos = argv
            .iter()
            .position(|a| a == "--input-format")
            .expect("input-format flag");
        assert_eq!(argv[pos + 1], "stream-json");
        assert!(argv.iter().any(|a| a == "--verbose"));
        let pos = argv
            .iter()
            .position(|a| a == "--permission-mode")
            .expect("permission-mode flag");
        assert_eq!(argv[pos + 1], "bypassPermissions");
    }

    #[test]
    fn build_argv_appends_resume_when_provided() {
        let argv = build_argv(
            &ClaudeAdapterOptions::default(),
            Some(&ResumeKey::new("sess-7")),
        );
        let pos = argv
            .iter()
            .position(|a| a == "--resume")
            .expect("resume flag");
        assert_eq!(argv[pos + 1], "sess-7");
    }

    #[test]
    fn build_argv_appends_mcp_config_with_strict() {
        let opts = ClaudeAdapterOptions {
            mcp_config: Some(PathBuf::from("/tmp/mcp.json")),
            ..ClaudeAdapterOptions::default()
        };
        let argv = build_argv(&opts, None);
        let pos = argv
            .iter()
            .position(|a| a == "--mcp-config")
            .expect("mcp-config flag");
        assert_eq!(argv[pos + 1], "/tmp/mcp.json");
        assert!(argv.iter().any(|a| a == "--strict-mcp-config"));
    }

    #[test]
    fn build_argv_appends_model_and_system_prompt() {
        let opts = ClaudeAdapterOptions {
            model: Some("claude-sonnet-4-5".into()),
            system_prompt: Some("be terse".into()),
            ..ClaudeAdapterOptions::default()
        };
        let argv = build_argv(&opts, None);
        let pos = argv.iter().position(|a| a == "--model").expect("model");
        assert_eq!(argv[pos + 1], "claude-sonnet-4-5");
        let pos = argv
            .iter()
            .position(|a| a == "--system-prompt")
            .expect("system-prompt");
        assert_eq!(argv[pos + 1], "be terse");
    }

    #[test]
    fn permission_mode_serializes_to_camel_case() {
        assert_eq!(
            ClaudePermissionMode::BypassPermissions.as_arg(),
            "bypassPermissions"
        );
        assert_eq!(ClaudePermissionMode::AcceptEdits.as_arg(), "acceptEdits");
        assert_eq!(ClaudePermissionMode::Plan.as_arg(), "plan");
        assert_eq!(ClaudePermissionMode::Default.as_arg(), "default");
    }

    #[test]
    fn append_stderr_tail_drops_oldest_when_full() {
        let mut tail = VecDeque::with_capacity(2);
        append_stderr_tail(&mut tail, 2, "a".into());
        append_stderr_tail(&mut tail, 2, "b".into());
        append_stderr_tail(&mut tail, 2, "c".into());
        assert_eq!(tail.iter().cloned().collect::<Vec<_>>(), vec!["b", "c"]);
    }
}
