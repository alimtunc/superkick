//! Local agent supervisor — spawns and manages CLI agent processes (claude, codex).
//!
//! Owns the full lifecycle: spawn → stream output → wait/timeout/cancel → record result.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::Utc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;
use tracing::{debug, info, warn};

use superkick_core::{
    AgentProvider, AgentSession, AgentSessionId, AgentStatus, EventKind, EventLevel, RunEvent,
    RunId, StepId,
};
use superkick_storage::repo::{AgentSessionRepo, RunEventRepo};

/// Configuration for launching an agent session.
pub struct AgentLaunchConfig {
    pub run_id: RunId,
    pub step_id: StepId,
    pub provider: AgentProvider,
    /// Full command-line arguments (e.g. `["claude", "--print", "fix the bug"]`).
    pub args: Vec<String>,
    /// Working directory (worktree path).
    pub workdir: PathBuf,
    /// Maximum duration before the process is killed.
    pub timeout: Duration,
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
}

/// Process supervisor for local CLI agents.
pub struct AgentSupervisor<S, E> {
    session_repo: Arc<S>,
    event_repo: Arc<E>,
}

impl<S, E> AgentSupervisor<S, E>
where
    S: AgentSessionRepo + 'static,
    E: RunEventRepo + 'static,
{
    pub fn new(session_repo: Arc<S>, event_repo: Arc<E>) -> Self {
        Self {
            session_repo,
            event_repo,
        }
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
        };

        self.session_repo.insert(&session).await?;

        let cancel_token = CancellationToken::new();
        let handle = AgentHandle {
            session_id,
            cancel_token: cancel_token.clone(),
        };

        let session_repo = Arc::clone(&self.session_repo);
        let event_repo = Arc::clone(&self.event_repo);

        let join = tokio::spawn(run_supervised(
            session,
            config.args,
            config.workdir,
            config.timeout,
            cancel_token,
            session_repo,
            event_repo,
        ));

        Ok((handle, join))
    }
}

/// Core supervised lifecycle — spawn, stream, wait/cancel/timeout, persist.
async fn run_supervised<S, E>(
    mut session: AgentSession,
    args: Vec<String>,
    workdir: PathBuf,
    timeout: Duration,
    cancel_token: CancellationToken,
    session_repo: Arc<S>,
    event_repo: Arc<E>,
) -> Result<AgentResult>
where
    S: AgentSessionRepo + 'static,
    E: RunEventRepo + 'static,
{
    let run_id = session.run_id;
    let step_id = session.run_step_id;
    let program = args.first().context("args must not be empty")?;

    debug!(
        provider = %session.provider,
        command = %session.command,
        workdir = %workdir.display(),
        "spawning agent"
    );

    let mut child = Command::new(program)
        .args(&args[1..])
        .current_dir(&workdir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .with_context(|| format!("failed to spawn `{}`", session.command))?;

    let pid = child.id();
    session.pid = pid;
    session.status = AgentStatus::Running;
    session_repo.update(&session).await?;

    info!(provider = %session.provider, pid = ?pid, "agent running");

    emit_event(
        &*event_repo,
        run_id,
        step_id,
        EventKind::AgentOutput,
        EventLevel::Info,
        format!("agent {} started (pid {:?})", session.provider, pid),
    )
    .await;

    // Stream stdout/stderr concurrently into run events.
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_task = {
        let event_repo = Arc::clone(&event_repo);
        tokio::spawn(async move {
            if let Some(out) = stdout {
                let mut lines = BufReader::new(out).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    emit_event(
                        &*event_repo,
                        run_id,
                        step_id,
                        EventKind::AgentOutput,
                        EventLevel::Info,
                        line,
                    )
                    .await;
                }
            }
        })
    };

    let stderr_task = {
        let event_repo = Arc::clone(&event_repo);
        tokio::spawn(async move {
            if let Some(err) = stderr {
                let mut lines = BufReader::new(err).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    emit_event(
                        &*event_repo,
                        run_id,
                        step_id,
                        EventKind::AgentOutput,
                        EventLevel::Warn,
                        line,
                    )
                    .await;
                }
            }
        })
    };

    // Wait for process with timeout and cancellation.
    let exit_status = tokio::select! {
        status = child.wait() => {
            status.context("failed to wait on agent process")?
        }
        _ = tokio::time::sleep(timeout) => {
            warn!(pid = ?pid, "agent timed out, killing");
            kill_child(&mut child).await;
            session.status = AgentStatus::Failed;
            session.finished_at = Some(Utc::now());
            emit_event(
                &*event_repo, run_id, step_id,
                EventKind::Error, EventLevel::Error,
                format!("agent {} timed out after {timeout:?}", session.provider),
            ).await;
            let _ = tokio::join!(stdout_task, stderr_task);
            session_repo.update(&session).await?;
            return Ok(AgentResult { session });
        }
        _ = cancel_token.cancelled() => {
            warn!(pid = ?pid, "agent cancelled, killing");
            kill_child(&mut child).await;
            session.status = AgentStatus::Cancelled;
            session.finished_at = Some(Utc::now());
            emit_event(
                &*event_repo, run_id, step_id,
                EventKind::AgentOutput, EventLevel::Warn,
                format!("agent {} cancelled", session.provider),
            ).await;
            let _ = tokio::join!(stdout_task, stderr_task);
            session_repo.update(&session).await?;
            return Ok(AgentResult { session });
        }
    };

    // Flush remaining output.
    let _ = tokio::join!(stdout_task, stderr_task);

    let code = exit_status.code();
    session.exit_code = code;
    session.finished_at = Some(Utc::now());

    if exit_status.success() {
        session.status = AgentStatus::Completed;
        info!(provider = %session.provider, "agent completed successfully");
        emit_event(
            &*event_repo,
            run_id,
            step_id,
            EventKind::AgentOutput,
            EventLevel::Info,
            format!("agent {} completed (exit 0)", session.provider),
        )
        .await;
    } else {
        session.status = AgentStatus::Failed;
        warn!(provider = %session.provider, exit_code = ?code, "agent failed");
        emit_event(
            &*event_repo,
            run_id,
            step_id,
            EventKind::Error,
            EventLevel::Error,
            format!(
                "agent {} failed (exit {})",
                session.provider,
                code.unwrap_or(-1)
            ),
        )
        .await;
    }

    session_repo.update(&session).await?;
    Ok(AgentResult { session })
}

/// Emit a run event, logging on failure rather than propagating.
async fn emit_event<E: RunEventRepo>(
    repo: &E,
    run_id: RunId,
    step_id: StepId,
    kind: EventKind,
    level: EventLevel,
    message: String,
) {
    let event = RunEvent::new(run_id, Some(step_id), kind, level, message);
    if let Err(e) = repo.insert(&event).await {
        warn!("failed to emit run event: {e}");
    }
}

/// Kill a child process (SIGKILL via tokio).
async fn kill_child(child: &mut tokio::process::Child) {
    if let Err(e) = child.kill().await {
        warn!("failed to kill agent process: {e}");
    }
}
