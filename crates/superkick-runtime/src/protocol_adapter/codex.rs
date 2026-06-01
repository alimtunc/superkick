//! Codex protocol adapter — runs `codex exec --json` (or `codex exec resume
//! --json`) and translates the JSONL stream into canonical `ProtocolEvent`s.
//!
//! Implementation choice for Codex CLI 0.128.0: `codex exec` exposes a stable
//! JSONL output mode (`--json`) and a documented resume command (`exec resume
//! <UUID>`). `codex app-server` exists but is marked experimental and uses a
//! richer JSON-RPC protocol — we deliberately stick with `exec --json` so the
//! contract sits on the same stable surface end users already drive
//! interactively. See `codex_stream.rs` for the parsed shape.
//!
//! The PTY supervisor (`agent_supervisor::lifecycle`) is unaffected; this
//! adapter is the structured alternative the orchestrator can switch on
//! explicitly. No automatic substitution.

use std::collections::VecDeque;
use std::future::Future;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::AtomicU64;
use std::time::Duration;

use anyhow::{Context, Result};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::time::{Instant, timeout};
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

use superkick_core::{Failure, ProtocolEvent, ResumeKey, TurnOutcome, TurnRequest};

use super::codex_stream::{ParserState, parse_line};
use super::process::{Termination, append_stderr_tail, emit_terminal, kill_with_grace, send_event};
use super::{
    ProtocolAdapter, ProtocolEventSender, ProtocolStream, TurnHandle, protocol_event_channel,
};

const PROVIDER: &str = "codex";

/// Sandbox posture forwarded to Codex via `--sandbox`. Defaults to
/// `WorkspaceWrite`, which matches the operator-supervised posture the run
/// supervisor uses today (write inside the worktree, read elsewhere).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum CodexSandboxMode {
    ReadOnly,
    #[default]
    WorkspaceWrite,
    DangerFullAccess,
}

impl CodexSandboxMode {
    fn as_arg(self) -> &'static str {
        match self {
            Self::ReadOnly => "read-only",
            Self::WorkspaceWrite => "workspace-write",
            Self::DangerFullAccess => "danger-full-access",
        }
    }
}

/// Provider-specific knobs for `CodexProtocolAdapter`. Same shape principle as
/// `ClaudeAdapterOptions`: provider-only fields live here, the cross-provider
/// `TurnOptions` stays minimal.
#[derive(Debug, Clone)]
pub struct CodexAdapterOptions {
    /// Path to the `codex` executable. `None` = look up `codex` on PATH.
    pub codex_executable: Option<PathBuf>,
    /// Optional model alias forwarded as `--model <value>`. Falls back to the
    /// CLI's own default when `None`.
    pub model: Option<String>,
    /// Sandbox posture. Defaults to `workspace-write`.
    pub sandbox: CodexSandboxMode,
    /// When `true`, append `--skip-git-repo-check` so the run does not require
    /// the workdir to be a git repo. The supervisor always runs in a worktree
    /// today, but tests + ad-hoc invocations need this off the happy path.
    pub skip_git_repo_check: bool,
    /// Maximum number of stderr lines kept in the rolling buffer used to
    /// enrich `Failure.message` when Codex exits non-zero without a terminal
    /// JSONL event. 64 is the same default as the Claude adapter.
    pub stderr_tail_lines: usize,
}

impl Default for CodexAdapterOptions {
    fn default() -> Self {
        Self {
            codex_executable: None,
            model: None,
            sandbox: CodexSandboxMode::default(),
            skip_git_repo_check: true,
            stderr_tail_lines: 64,
        }
    }
}

/// Provider-neutral adapter that drives `codex exec --json`.
#[derive(Debug, Clone, Default)]
pub struct CodexProtocolAdapter {
    options: CodexAdapterOptions,
}

impl CodexProtocolAdapter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_options(options: CodexAdapterOptions) -> Self {
        Self { options }
    }

    pub fn options(&self) -> &CodexAdapterOptions {
        &self.options
    }

    fn spawn(&self, request: TurnRequest, resume: Option<ResumeKey>) -> Result<ProtocolStream> {
        let argv = build_argv(&self.options, resume.as_ref(), &request.workdir);
        let executable = self
            .options
            .codex_executable
            .clone()
            .unwrap_or_else(|| PathBuf::from("codex"));

        info!(
            executable = %executable.display(),
            argv = ?argv,
            workdir = %request.workdir.display(),
            "codex protocol adapter argv (prompt elided)",
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
            .with_context(|| format!("spawn codex executable {}", executable.display()))?;

        let stdin = child.stdin.take().context("codex child has no stdin")?;
        let prompt = request.prompt.clone();
        tokio::spawn(async move {
            if let Err(err) = write_initial_prompt(stdin, &prompt).await {
                warn!(error = %err, "failed to write codex stdin prompt");
            }
        });

        let pump_options = PumpOptions {
            stderr_tail_lines: self.options.stderr_tail_lines,
            timeout: request.options.timeout,
            attempted_resume_key: resume,
        };

        Ok(spawn_pump(child, pump_options))
    }
}

impl ProtocolAdapter for CodexProtocolAdapter {
    fn name(&self) -> &'static str {
        "codex"
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
///
/// `codex exec resume` rejects `--sandbox` and `--cd` because the resumed
/// session reuses the originating session's settings; we drop those flags on
/// the resume path.
pub(crate) fn build_argv(
    options: &CodexAdapterOptions,
    resume: Option<&ResumeKey>,
    workdir: &std::path::Path,
) -> Vec<String> {
    let mut argv = vec!["exec".to_string()];

    if let Some(key) = resume {
        argv.push("resume".to_string());
        argv.push("--json".to_string());
        if options.skip_git_repo_check {
            argv.push("--skip-git-repo-check".to_string());
        }
        if let Some(model) = &options.model {
            argv.push("--model".to_string());
            argv.push(model.clone());
        }
        argv.push(key.as_str().to_string());
    } else {
        argv.push("--json".to_string());
        if options.skip_git_repo_check {
            argv.push("--skip-git-repo-check".to_string());
        }
        argv.push("--sandbox".to_string());
        argv.push(options.sandbox.as_arg().to_string());
        argv.push("--cd".to_string());
        argv.push(workdir.to_string_lossy().into_owned());
        if let Some(model) = &options.model {
            argv.push("--model".to_string());
            argv.push(model.clone());
        }
    }

    // `-` makes Codex read the prompt from stdin, mirroring the Claude
    // adapter's stdin protocol so callers don't put prompts on argv.
    argv.push("-".to_string());
    argv
}

async fn write_initial_prompt(mut stdin: tokio::process::ChildStdin, prompt: &str) -> Result<()> {
    stdin
        .write_all(prompt.as_bytes())
        .await
        .context("write codex stdin prompt")?;
    if !prompt.ends_with('\n') {
        stdin
            .write_all(b"\n")
            .await
            .context("write codex stdin trailing newline")?;
    }
    stdin
        .shutdown()
        .await
        .context("close codex stdin (one-shot turn)")?;
    Ok(())
}

#[derive(Debug, Clone)]
pub(crate) struct PumpOptions {
    pub stderr_tail_lines: usize,
    pub timeout: Option<Duration>,
    /// Resume key the caller passed to `resume_turn`, if any. Surfaced in the
    /// failure message when Codex rejects the resume so the operator can see
    /// which id was tried.
    pub attempted_resume_key: Option<ResumeKey>,
}

/// Construct a `ProtocolStream` from an already-spawned child. Spawns the pump
/// task and returns immediately. Public-to-crate so the integration tests can
/// drive the same machinery with a mock child.
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
        .context("codex child missing stdout pipe")?;
    let stderr = child
        .stderr
        .take()
        .context("codex child missing stderr pipe")?;

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
                warn!("codex protocol turn cancelled by operator");
                kill_with_grace(PROVIDER, &mut child).await;
                drain_remaining_stdout(
                    &mut stdout_lines,
                    &mut state,
                    &tx,
                    &seq,
                    &mut completion_outcome,
                ).await;
                let outcome = emit_terminal(
                    PROVIDER,
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
                warn!(?timeout_dur, "codex protocol turn timed out");
                kill_with_grace(PROVIDER, &mut child).await;
                drain_remaining_stdout(
                    &mut stdout_lines,
                    &mut state,
                    &tx,
                    &seq,
                    &mut completion_outcome,
                ).await;
                let outcome = emit_terminal(
                    PROVIDER,
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
                        warn!(error = %err, "codex stdout read error");
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
                        warn!(error = %err, "codex stderr read error");
                        stderr_done = true;
                    }
                }
            }
        }
    }

    if let Some(outcome) = completion_outcome {
        return Ok(outcome);
    }

    let exit = child.wait().await.context("await codex child exit")?;
    let exit_code = exit.code().unwrap_or(-1);
    let tail = stderr_tail
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join("\n");

    let mut message = if tail.is_empty() {
        format!("codex exited with code {exit_code}")
    } else {
        format!("codex exited with code {exit_code}: {tail}")
    };
    let mut code = format!("codex_exit_{exit_code}");

    // If we asked Codex to resume an unknown session, the message is the
    // single most useful diagnostic for the operator — synthesise a stable
    // `resume_not_found` code so downstream code can branch on it without
    // string matching the human-readable text.
    if let Some(attempted) = options.attempted_resume_key.as_ref() {
        if tail.contains("no rollout found") || tail.contains("thread/resume") {
            code = "resume_not_found".to_string();
            message = format!(
                "codex rejected resume of thread {}: {}",
                attempted.as_str(),
                tail
            );
        }
    }

    send_event(
        PROVIDER,
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

        send_event(PROVIDER, tx, seq, event).await;

        if let Some(outcome) = terminal_outcome {
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
    while let Ok(Ok(Some(text))) =
        timeout(Duration::from_millis(50), stdout_lines.next_line()).await
    {
        process_stdout_line(&text, state, tx, seq, completion_outcome).await;
    }
}

/// Test seam: spawn the pump task against an externally-built `Child` so
/// integration tests can use a POSIX `cat <fixture>` mock instead of a real
/// codex binary. Mirrors the Claude adapter's `spawn_pump_for_test`.
#[doc(hidden)]
pub fn spawn_pump_for_test(
    child: Child,
    stderr_tail_lines: usize,
    timeout: Option<Duration>,
    attempted_resume_key: Option<ResumeKey>,
) -> ProtocolStream {
    spawn_pump(
        child,
        PumpOptions {
            stderr_tail_lines,
            timeout,
            attempted_resume_key,
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn build_argv_start_turn_includes_required_flags() {
        let argv = build_argv(
            &CodexAdapterOptions::default(),
            None,
            Path::new("/tmp/work"),
        );
        assert_eq!(argv[0], "exec");
        assert!(argv.iter().any(|a| a == "--json"));
        let pos = argv
            .iter()
            .position(|a| a == "--sandbox")
            .expect("sandbox flag");
        assert_eq!(argv[pos + 1], "workspace-write");
        let pos = argv.iter().position(|a| a == "--cd").expect("cd flag");
        assert_eq!(argv[pos + 1], "/tmp/work");
        assert_eq!(argv.last().map(String::as_str), Some("-"));
    }

    #[test]
    fn build_argv_resume_omits_sandbox_and_cd_per_cli_contract() {
        // `codex exec resume` rejects --sandbox / --cd — verify we don't pass
        // them on the resume path. Regression test for the resume CLI surface
        // observed on Codex 0.128.0.
        let argv = build_argv(
            &CodexAdapterOptions::default(),
            Some(&ResumeKey::new("019d-uuid")),
            Path::new("/tmp/work"),
        );
        assert_eq!(argv[0], "exec");
        assert_eq!(argv[1], "resume");
        assert!(argv.iter().any(|a| a == "--json"));
        assert!(
            !argv.iter().any(|a| a == "--sandbox"),
            "--sandbox must not appear on resume argv"
        );
        assert!(
            !argv.iter().any(|a| a == "--cd"),
            "--cd must not appear on resume argv"
        );
        assert!(argv.iter().any(|a| a == "019d-uuid"));
        assert_eq!(argv.last().map(String::as_str), Some("-"));
    }

    #[test]
    fn build_argv_passes_model_when_set() {
        let opts = CodexAdapterOptions {
            model: Some("o3".into()),
            ..CodexAdapterOptions::default()
        };
        let argv = build_argv(&opts, None, Path::new("/tmp/work"));
        let pos = argv.iter().position(|a| a == "--model").expect("model");
        assert_eq!(argv[pos + 1], "o3");
    }

    #[test]
    fn build_argv_skip_git_repo_check_toggle() {
        let opts = CodexAdapterOptions {
            skip_git_repo_check: false,
            ..CodexAdapterOptions::default()
        };
        let argv = build_argv(&opts, None, Path::new("/tmp/work"));
        assert!(!argv.iter().any(|a| a == "--skip-git-repo-check"));
    }

    #[test]
    fn sandbox_mode_serializes_as_documented_cli_value() {
        assert_eq!(CodexSandboxMode::ReadOnly.as_arg(), "read-only");
        assert_eq!(CodexSandboxMode::WorkspaceWrite.as_arg(), "workspace-write");
        assert_eq!(
            CodexSandboxMode::DangerFullAccess.as_arg(),
            "danger-full-access"
        );
    }
}
