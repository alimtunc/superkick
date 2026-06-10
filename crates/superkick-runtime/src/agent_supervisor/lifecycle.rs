//! PTY-backed agent lifecycle — spawn, stream, wait/cancel/timeout, persist.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::Utc;
use portable_pty::CommandBuilder;
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;
use tracing::{debug, info, warn};

use superkick_core::{
    AgentSession, AgentStatus, EventKind, EventLevel, RunId, SessionLifecyclePhase,
};
use superkick_storage::repo::{AgentSessionRepo, RunEventRepo, TranscriptRepo};

use super::output::spawn_output_reader;
use super::process::{SpawnedPty, kill_by_pid, open_pty_and_spawn, spawn_initial_input_injection};
use super::{AgentResult, record_lifecycle};
use crate::pty_session::PtySessionRegistry;
use crate::session_bus::SessionBus;
use crate::step_engine::emit_event;

/// Dependencies for the supervised lifecycle, bundled to keep the arg count manageable.
pub(crate) struct SupervisedDeps<S, E, T> {
    pub session_repo: Arc<S>,
    pub event_repo: Arc<E>,
    pub transcript_repo: Arc<T>,
    pub registry: Arc<PtySessionRegistry>,
    /// Optional bus — when attached, every state transition publishes a
    /// `SessionLifecycleEvent` (SUP-79 spawn-and-observe).
    pub lifecycle_bus: Option<Arc<SessionBus>>,
    /// Kill the process after this much output silence (no-output watchdog),
    /// reset on every chunk. `None` disables it.
    pub idle_timeout: Option<Duration>,
}

/// Spawn the agent via PTY and supervise it to completion.
pub(crate) async fn run_supervised<S, E, T>(
    mut session: AgentSession,
    args: Vec<String>,
    workdir: PathBuf,
    timeout: Duration,
    initial_stdin: Option<String>,
    cancel_token: CancellationToken,
    deps: SupervisedDeps<S, E, T>,
) -> Result<AgentResult>
where
    S: AgentSessionRepo + 'static,
    E: RunEventRepo + 'static,
    T: TranscriptRepo + 'static,
{
    let SupervisedDeps {
        session_repo,
        event_repo,
        transcript_repo,
        registry,
        lifecycle_bus,
        idle_timeout,
    } = deps;
    let run_id = session.run_id;
    let step_id = session.run_step_id;

    let spawned = spawn_pty_child(&args, &workdir, &session.command, run_id)?;
    let mut child = spawned.child;
    let pty_session = spawned.session;
    let broadcast_tx = spawned.broadcast_tx;

    // Register the live session so API handlers can attach.
    registry.register(run_id, Arc::clone(&pty_session));

    let pid = child.process_id();
    session.pid = pid;
    session.status = AgentStatus::Running;
    session_repo.update(&session).await?;
    record_lifecycle(
        lifecycle_bus.as_deref(),
        &*event_repo,
        &session,
        SessionLifecyclePhase::Running,
    )
    .await;

    debug!(provider = %session.provider, pid = ?pid, "agent running (PTY)");

    // Log the exact argv (minus the final positional prompt, which is huge)
    // so `unknown option` CLI errors are debuggable from the run log.
    let argv_preview: Vec<&str> = args
        .iter()
        .take(args.len().saturating_sub(1))
        .map(String::as_str)
        .collect();
    tracing::info!(run_id = %run_id, argv = ?argv_preview, "agent argv (prompt elided)");

    emit_event(
        &*event_repo,
        run_id,
        Some(step_id),
        EventKind::AgentOutput,
        EventLevel::Info,
        format!("agent {} started (pid {:?})", session.provider, pid),
    )
    .await;

    // Start draining the PTY output BEFORE injecting the prompt. The reader
    // broadcasts and persists agent output; with nothing draining it, a large
    // prompt write deadlocks against the agent's startup banner (the PTY
    // buffers fill in both directions) and wedges the writing thread.
    // The no-output watchdog watches this activity channel; the output reader
    // pings it per chunk. Only created when the watchdog is armed.
    let (activity_tx, activity_rx) = match idle_timeout {
        Some(_) => {
            let (tx, rx) = watch::channel(0u64);
            (Some(tx), Some(rx))
        }
        None => (None, None),
    };
    let output_pipeline = spawn_output_reader(
        spawned.master_reader,
        run_id,
        session.provider,
        Arc::clone(&pty_session),
        broadcast_tx,
        transcript_repo,
        activity_tx,
    );
    let crate::agent_supervisor::output::OutputPipeline {
        persist_join: output_task,
        step_result_rx,
        transcript_hints_rx,
    } = output_pipeline;

    if let Some(payload) = initial_stdin {
        spawn_initial_input_injection(Arc::clone(&pty_session), payload, run_id);
    }

    // child.wait() is blocking (portable-pty API), so wrap in spawn_blocking.
    let wait_handle = tokio::task::spawn_blocking(move || child.wait());

    let exit_status = tokio::select! {
        result = wait_handle => {
            result
                .context("agent wait task panicked")?
                .context("failed to wait on agent process")?
        }
        kind = deadline_reached(timeout, idle_timeout, activity_rx) => {
            // The wall-clock budget OR the no-output idle window tripped. Both
            // kill the child and surface TimedOut, but the ledger message
            // distinguishes a hung (silent) agent from one that ran out of time.
            let (after, message) = match kind {
                DeadlineKind::Wall => (
                    timeout,
                    format!("agent {} timed out after {timeout:?}", session.provider),
                ),
                DeadlineKind::Idle(idle) => (
                    idle,
                    super::no_output_watchdog_message(session.provider, idle),
                ),
            };
            warn!(pid = ?pid, "{message}");
            kill_by_pid(pid);
            session.status = AgentStatus::Failed;
            session.finished_at = Some(Utc::now());
            emit_event(
                &*event_repo, run_id, Some(step_id),
                EventKind::Error, EventLevel::Error, message,
            ).await;
            let _ = output_task.await;
            let step_result = step_result_rx.await.unwrap_or(Ok(None));
            let transcript_hints = transcript_hints_rx.await.unwrap_or_default();
            session_repo.update(&session).await?;
            record_lifecycle(
                lifecycle_bus.as_deref(),
                &*event_repo,
                &session,
                SessionLifecyclePhase::TimedOut,
            )
            .await;
            schedule_cleanup(registry, run_id);
            return Ok(AgentResult {
                session,
                step_result,
                lifecycle_phase: SessionLifecyclePhase::TimedOut,
                timeout_after: Some(after),
                transcript_hints,
                resume_key: None,
            });
        }
        _ = cancel_token.cancelled() => {
            warn!(pid = ?pid, "agent cancelled, killing");
            kill_by_pid(pid);
            session.status = AgentStatus::Cancelled;
            session.finished_at = Some(Utc::now());
            emit_event(
                &*event_repo, run_id, Some(step_id),
                EventKind::AgentOutput, EventLevel::Warn,
                format!("agent {} cancelled", session.provider),
            ).await;
            let _ = output_task.await;
            let step_result = step_result_rx.await.unwrap_or(Ok(None));
            let transcript_hints = transcript_hints_rx.await.unwrap_or_default();
            session_repo.update(&session).await?;
            record_lifecycle(
                lifecycle_bus.as_deref(),
                &*event_repo,
                &session,
                SessionLifecyclePhase::Cancelled,
            )
            .await;
            schedule_cleanup(registry, run_id);
            return Ok(AgentResult {
                session,
                step_result,
                lifecycle_phase: SessionLifecyclePhase::Cancelled,
                timeout_after: None,
                transcript_hints,
                resume_key: None,
            });
        }
    };

    // Flush remaining output from the PTY master.
    let _ = output_task.await;
    // Degrade a dropped scanner task to "no marker observed" rather than crashing.
    let step_result = step_result_rx.await.unwrap_or(Ok(None));
    let transcript_hints = transcript_hints_rx.await.unwrap_or_default();

    finalize_session(&mut session, &exit_status, &event_repo, &session_repo).await?;
    let terminal_phase = if exit_status.success() {
        SessionLifecyclePhase::Completed {
            exit_code: exit_status.exit_code() as i32,
        }
    } else {
        SessionLifecyclePhase::Failed {
            exit_code: Some(exit_status.exit_code() as i32),
            reason: format!("exit code {}", exit_status.exit_code() as i32),
        }
    };
    record_lifecycle(
        lifecycle_bus.as_deref(),
        &*event_repo,
        &session,
        terminal_phase.clone(),
    )
    .await;
    schedule_cleanup(registry, run_id);
    Ok(AgentResult {
        session,
        step_result,
        lifecycle_phase: terminal_phase,
        timeout_after: None,
        transcript_hints,
        resume_key: None,
    })
}

/// Which deadline tripped — the total wall-clock budget, or the no-output (idle) window.
enum DeadlineKind {
    Wall,
    Idle(Duration),
}

/// Resolve when either the total `wall` budget elapses or — when the watchdog
/// is armed — `idle` passes with no output activity. Output chunks ping
/// `activity`, resetting the idle window, so a busy-but-quiet-bursting agent is
/// never killed early.
async fn deadline_reached(
    wall: Duration,
    idle: Option<Duration>,
    activity: Option<watch::Receiver<u64>>,
) -> DeadlineKind {
    match (idle, activity) {
        (Some(idle_dur), Some(rx)) => tokio::select! {
            _ = tokio::time::sleep(wall) => DeadlineKind::Wall,
            _ = idle_deadline(rx, idle_dur) => DeadlineKind::Idle(idle_dur),
        },
        _ => {
            tokio::time::sleep(wall).await;
            DeadlineKind::Wall
        }
    }
}

/// Resolve once `idle` elapses with no activity ping. Each ping resets the
/// window. Once the sender drops (the child's output stream closed on exit) it
/// never resolves — the child-exit arm of the supervisor wins instead, so a
/// clean exit is never misreported as a hang.
async fn idle_deadline(mut activity: watch::Receiver<u64>, idle: Duration) {
    loop {
        match tokio::time::timeout(idle, activity.changed()).await {
            Err(_elapsed) => return,
            Ok(Ok(())) => continue,
            Ok(Err(_closed)) => std::future::pending::<()>().await,
        }
    }
}

/// Open a PTY pair and spawn the child process on the slave side.
fn spawn_pty_child(
    args: &[String],
    workdir: &std::path::Path,
    command_display: &str,
    run_id: RunId,
) -> Result<SpawnedPty> {
    let program = args.first().context("args must not be empty")?;

    let mut cmd = CommandBuilder::new(program);
    cmd.args(&args[1..]);
    cmd.cwd(workdir);

    open_pty_and_spawn(
        run_id,
        cmd,
        "PTY",
        &format!("failed to spawn `{command_display}` via PTY"),
    )
}

/// Schedule deferred cleanup of the PTY session from the registry (30s delay).
fn schedule_cleanup(registry: Arc<PtySessionRegistry>, run_id: RunId) {
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(30)).await;
        registry.remove(run_id);
        debug!("PTY session cleaned up for run {run_id}");
    });
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
            Some(step_id),
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
            Some(step_id),
            EventKind::Error,
            EventLevel::Error,
            format!("agent {} failed (exit {code})", session.provider),
        )
        .await;
    }

    session_repo.update(session).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Real (short) durations: timers fire at-or-after their deadline, never
    // early, so every assertion here is a robust lower-bound / never-completes.

    #[tokio::test]
    async fn idle_deadline_trips_after_configured_silence() {
        let (_tx, rx) = watch::channel(0u64);
        let start = std::time::Instant::now();
        // No activity ever arrives (sender stays alive) → the window elapses.
        idle_deadline(rx, Duration::from_millis(80)).await;
        assert!(
            start.elapsed() >= Duration::from_millis(80),
            "must wait the full idle window before tripping"
        );
    }

    #[tokio::test]
    async fn idle_deadline_resets_on_activity() {
        let (tx, rx) = watch::channel(0u64);
        let task = tokio::spawn(idle_deadline(rx, Duration::from_millis(120)));
        // Bursts every 40ms (well inside the 120ms window) keep resetting it; a
        // no-activity run would have tripped by now.
        for _ in 0..3 {
            tokio::time::sleep(Duration::from_millis(40)).await;
            tx.send_modify(|n| *n += 1);
            assert!(
                !task.is_finished(),
                "must not trip while output keeps arriving"
            );
        }
        task.abort();
    }

    #[tokio::test]
    async fn idle_deadline_defers_to_exit_when_output_stream_closes() {
        let (tx, rx) = watch::channel(0u64);
        let mut task = tokio::spawn(idle_deadline(rx, Duration::from_millis(30)));
        // The child exited: the output reader finished and dropped the sender.
        drop(tx);
        // The watchdog must NOT trip — a clean exit is the supervisor's job to
        // report, not the watchdog's. It stays pending well past the window.
        assert!(
            tokio::time::timeout(Duration::from_millis(120), &mut task)
                .await
                .is_err(),
            "watchdog must defer to the exit arm once the output stream closes"
        );
        task.abort();
    }
}
