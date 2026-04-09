//! PTY-backed agent lifecycle — spawn, stream, wait/cancel/timeout, persist.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::Utc;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use tokio_util::sync::CancellationToken;
use tracing::{debug, info, warn};

use superkick_core::{AgentSession, AgentStatus, EventKind, EventLevel};
use superkick_storage::repo::{AgentSessionRepo, RunEventRepo};

use super::AgentResult;
use super::output::{emit_event, spawn_output_reader};
use super::process::kill_by_pid;

/// Spawn the agent via PTY and supervise it to completion.
pub(crate) async fn run_supervised<S, E>(
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

    let (mut child, master_reader) = spawn_pty_child(&args, &workdir, &session.command)?;

    let pid = child.process_id();
    session.pid = pid;
    session.status = AgentStatus::Running;
    session_repo.update(&session).await?;

    debug!(provider = %session.provider, pid = ?pid, "agent running (PTY)");

    emit_event(
        &*event_repo,
        run_id,
        step_id,
        EventKind::AgentOutput,
        EventLevel::Info,
        format!("agent {} started (pid {:?})", session.provider, pid),
    )
    .await;

    let output_task = spawn_output_reader(master_reader, run_id, step_id, Arc::clone(&event_repo));

    // child.wait() is blocking (portable-pty API), so wrap in spawn_blocking.
    let wait_handle = tokio::task::spawn_blocking(move || child.wait());

    let exit_status = tokio::select! {
        result = wait_handle => {
            result
                .context("agent wait task panicked")?
                .context("failed to wait on agent process")?
        }
        _ = tokio::time::sleep(timeout) => {
            warn!(pid = ?pid, "agent timed out, killing");
            kill_by_pid(pid);
            session.status = AgentStatus::Failed;
            session.finished_at = Some(Utc::now());
            emit_event(
                &*event_repo, run_id, step_id,
                EventKind::Error, EventLevel::Error,
                format!("agent {} timed out after {timeout:?}", session.provider),
            ).await;
            let _ = output_task.await;
            session_repo.update(&session).await?;
            return Ok(AgentResult { session });
        }
        _ = cancel_token.cancelled() => {
            warn!(pid = ?pid, "agent cancelled, killing");
            kill_by_pid(pid);
            session.status = AgentStatus::Cancelled;
            session.finished_at = Some(Utc::now());
            emit_event(
                &*event_repo, run_id, step_id,
                EventKind::AgentOutput, EventLevel::Warn,
                format!("agent {} cancelled", session.provider),
            ).await;
            let _ = output_task.await;
            session_repo.update(&session).await?;
            return Ok(AgentResult { session });
        }
    };

    // Flush remaining output from the PTY master.
    let _ = output_task.await;

    finalize_session(&mut session, &exit_status, &event_repo, &session_repo).await?;
    Ok(AgentResult { session })
}

/// Open a PTY pair and spawn the child process on the slave side.
///
/// Returns the child handle and a reader for the master side.
/// The master reader is cloned before spawning to avoid a race with fast-exiting processes.
fn spawn_pty_child(
    args: &[String],
    workdir: &PathBuf,
    command_display: &str,
) -> Result<(
    Box<dyn portable_pty::Child + Send + Sync>,
    Box<dyn std::io::Read + Send>,
)> {
    let program = args.first().context("args must not be empty")?;

    let pty_system = NativePtySystem::default();
    let pty_pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .context("failed to open PTY pair")?;

    // Clone the master reader before spawning — avoids a race if the child exits fast.
    let master_reader = pty_pair
        .master
        .try_clone_reader()
        .context("failed to clone PTY master reader")?;

    let mut cmd = CommandBuilder::new(program);
    cmd.args(&args[1..]);
    cmd.cwd(workdir);

    let child = pty_pair
        .slave
        .spawn_command(cmd)
        .with_context(|| format!("failed to spawn `{command_display}` via PTY"))?;

    // Drop the slave — the child owns it now. Keeping it open would prevent
    // EOF on the master when the child exits.
    drop(pty_pair.slave);

    Ok((child, master_reader))
}

/// Update session status based on exit result and persist.
async fn finalize_session<S, E>(
    session: &mut AgentSession,
    exit_status: &portable_pty::ExitStatus,
    event_repo: &Arc<E>,
    session_repo: &Arc<S>,
) -> Result<()>
where
    S: AgentSessionRepo + 'static,
    E: RunEventRepo + 'static,
{
    let run_id = session.run_id;
    let step_id = session.run_step_id;
    let success = exit_status.success();
    let code = exit_status.exit_code() as i32;

    session.exit_code = Some(code);
    session.finished_at = Some(Utc::now());

    if success {
        session.status = AgentStatus::Completed;
        info!(provider = %session.provider, "agent completed successfully");
        emit_event(
            &**event_repo,
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
            &**event_repo,
            run_id,
            step_id,
            EventKind::Error,
            EventLevel::Error,
            format!("agent {} failed (exit {code})", session.provider),
        )
        .await;
    }

    session_repo.update(session).await?;
    Ok(())
}
