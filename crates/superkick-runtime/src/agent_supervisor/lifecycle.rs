//! PTY-backed agent lifecycle — spawn, stream, wait/cancel/timeout, persist.

use std::future::Future;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::Utc;
use portable_pty::CommandBuilder;
use tokio::sync::{oneshot, watch};
use tokio_util::sync::CancellationToken;
use tracing::{debug, info, warn};

use superkick_core::{
    AgentProvider, AgentSession, AgentStatus, EventKind, EventLevel, RunId, SessionLifecyclePhase,
    StepResult,
};
use superkick_storage::repo::{AgentSessionRepo, RunEventRepo, TranscriptRepo};

use crate::protocol_adapter::MarkerError;

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
    /// Fired once the child is spawned and registered (the session is
    /// attachable). `None` on every non-launch-task path.
    pub session_live: Option<super::SessionLiveHook>,
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
        session_live,
    } = deps;
    let run_id = session.run_id;
    let step_id = session.run_step_id;

    // A fresh run worktree is an untrusted path: the interactive Claude TUI
    // would open its trust modal and swallow the injected opening prompt. Seed
    // trust before spawning so the directive lands in a clean composer.
    if session.provider == AgentProvider::Claude {
        crate::claude_trust::ensure_claude_trusts(&workdir);
    }

    let spawned = spawn_pty_child(&args, &workdir, &session.command, run_id)?;
    let mut child = spawned.child;
    let pty_session = spawned.session;
    let broadcast_tx = spawned.broadcast_tx;

    // Register the live session so API handlers can attach.
    registry.register(run_id, Arc::clone(&pty_session));
    // The child is spawned and attachable now — pulse the launch-task "session
    // live" hook so the cockpit can distinguish a live session from spawning.
    if let Some(hook) = session_live {
        hook();
    }

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
    // Held in an `Option` so the marker arm of the select can resolve it early
    // (a self-iterating REPL that prints its completion JSON without exiting)
    // while the child-exit / deadline / cancel arms still read it afterwards.
    // The marker arm `take()`s it; the others fall back to awaiting it.
    let mut step_result_rx = Some(step_result_rx);

    if let Some(payload) = initial_stdin {
        let output_rx = pty_session.subscribe();
        spawn_initial_input_injection(Arc::clone(&pty_session), payload, run_id, output_rx);
    }

    // child.wait() is blocking (portable-pty API), so wrap in spawn_blocking.
    let wait_handle = tokio::task::spawn_blocking(move || child.wait());

    // The scanner forwards the marker on the oneshot the first time it parses a
    // complete block (see `scan_chunks`). The early value is consumed once and
    // stashed here so the other select arms can still read it without
    // double-awaiting the oneshot.
    let mut stashed_step_result: Option<Result<Option<StepResult>, MarkerError>> = None;

    let exit_status = tokio::select! {
        sr = await_completed_marker(&mut step_result_rx, &mut stashed_step_result) => {
            // A self-iterating PTY REPL printed its completion JSON but the child
            // is still alive — kill it and finalize as a clean Completed.
            warn!(pid = ?pid, "step-result marker observed mid-stream; terminating live PTY session");
            kill_by_pid(pid);
            session.status = AgentStatus::Completed;
            session.exit_code = Some(0);
            session.finished_at = Some(Utc::now());
            emit_event(
                &*event_repo, run_id, Some(step_id),
                EventKind::AgentOutput, EventLevel::Info,
                format!("agent {} completed via step-result marker", session.provider),
            ).await;
            let _ = output_task.await;
            let transcript_hints = transcript_hints_rx.await.unwrap_or_default();
            session_repo.update(&session).await?;
            let terminal_phase = SessionLifecyclePhase::Completed { exit_code: 0 };
            record_lifecycle(
                lifecycle_bus.as_deref(),
                &*event_repo,
                &session,
                terminal_phase.clone(),
            )
            .await;
            schedule_cleanup(registry, run_id);
            return Ok(AgentResult {
                session,
                step_result: Ok(Some(sr)),
                lifecycle_phase: terminal_phase,
                timeout_after: None,
                transcript_hints,
                resume_key: None,
            });
        }
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
            let step_result = take_step_result(step_result_rx, stashed_step_result).await;
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
            let step_result = take_step_result(step_result_rx, stashed_step_result).await;
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
    let step_result = take_step_result(step_result_rx, stashed_step_result).await;
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

/// Resolve only when the scanner forwards a usable step-result completion
/// (`Ok(Some(_))`) on the oneshot. A non-usable early value (a malformed-marker
/// `Err`, or the `Ok(None)` finish-fallback) is stashed for the other select
/// arms to consume and the future then stays pending — so a marker parse error
/// can never be mistaken for a clean mid-stream completion.
///
/// The receiver is polled in place and only removed from `rx` once it actually
/// resolves; dropping this future before then (another select arm wins) leaves
/// the still-pending oneshot in `rx` for `take_step_result` to read — so no
/// in-flight EOF marker is lost.
async fn await_completed_marker(
    rx: &mut Option<oneshot::Receiver<Result<Option<StepResult>, MarkerError>>>,
    stash: &mut Option<Result<Option<StepResult>, MarkerError>>,
) -> StepResult {
    let resolved = std::future::poll_fn(|cx| {
        let Some(receiver) = rx.as_mut() else {
            return std::task::Poll::Pending;
        };
        std::pin::Pin::new(receiver).poll(cx)
    })
    .await;
    *rx = None;
    match resolved {
        Ok(Ok(Some(sr))) => sr,
        other => {
            // Sender dropped, malformed marker, or no marker: not a clean
            // completion — hand it back to the terminal arms and wait them out.
            *stash = Some(other.unwrap_or(Ok(None)));
            std::future::pending::<()>().await;
            unreachable!("pending never resolves");
        }
    }
}

/// Read the step-result the supervisor will report: the value already consumed
/// by the marker arm (`stash`), else what the oneshot still holds, degrading a
/// dropped scanner task to "no marker observed" rather than crashing.
async fn take_step_result(
    rx: Option<oneshot::Receiver<Result<Option<StepResult>, MarkerError>>>,
    stash: Option<Result<Option<StepResult>, MarkerError>>,
) -> Result<Option<StepResult>, MarkerError> {
    if let Some(value) = stash {
        return value;
    }
    match rx {
        Some(receiver) => receiver.await.unwrap_or(Ok(None)),
        None => Ok(None),
    }
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
    use std::sync::atomic::{AtomicUsize, Ordering};

    use superkick_core::{
        AgentProvider, AgentSessionId, ExecutionMode, Run, RunStep, StepKey, StepStatus,
        TriggerSource,
    };
    use superkick_storage::repo::{AgentSessionRepo as _, RunRepo as _, RunStepRepo as _};
    use superkick_storage::{
        SqliteAgentSessionRepo, SqliteRunEventRepo, SqliteRunStepRepo, SqliteTranscriptRepo,
        connect_with_capacity,
    };

    use super::*;

    // Real (short) durations: timers fire at-or-after their deadline, never
    // early, so every assertion here is a robust lower-bound / never-completes.

    const MARKER_BLOCK: &str = concat!(
        "SUPERKICK_STEP_RESULT_BEGIN\n",
        r#"{"status":"completed","summary":"mid-stream done","changed_files":[],"questions":[]}"#,
        "\n",
        "SUPERKICK_STEP_RESULT_END\n",
    );

    struct Harness {
        session_repo: Arc<SqliteAgentSessionRepo>,
        event_repo: Arc<SqliteRunEventRepo>,
        transcript_repo: Arc<SqliteTranscriptRepo>,
        registry: Arc<PtySessionRegistry>,
        session: AgentSession,
    }

    async fn harness() -> Harness {
        let pool = connect_with_capacity("sqlite::memory:", 1)
            .await
            .expect("db");
        let run_repo = superkick_storage::SqliteRunRepo::new(pool.clone());
        let step_repo = SqliteRunStepRepo::new(pool.clone());
        let event_repo = Arc::new(SqliteRunEventRepo::new(pool.clone()));
        let session_repo = Arc::new(SqliteAgentSessionRepo::new(pool.clone()));
        let transcript_repo = Arc::new(SqliteTranscriptRepo::new(pool.clone()));

        let run = Run::new(
            "T-PTY".into(),
            "T-PTY".into(),
            "owner/repo".into(),
            TriggerSource::LaunchTask,
            ExecutionMode::FullAuto,
            "main".into(),
            true,
            None,
        );
        let run_id = run.id;
        run_repo.insert(&run).await.expect("insert run");
        let mut step = RunStep::new(run_id, StepKey::Code, 1);
        step.status = StepStatus::Running;
        step_repo.insert(&step).await.expect("insert step");

        let session = AgentSession {
            id: AgentSessionId::new(),
            run_id,
            run_step_id: step.id,
            provider: AgentProvider::Claude,
            command: "sh".into(),
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
            role: Some("coder".into()),
            purpose: Some("pty marker test".into()),
            parent_session_id: None,
            launch_reason: Some(superkick_core::LaunchReason::InitialStep),
            handoff_id: None,
            provider_session_id: None,
            runner_mode: None,
            billing_profile: None,
        };
        session_repo.insert(&session).await.expect("insert session");

        Harness {
            session_repo,
            event_repo,
            transcript_repo,
            registry: Arc::new(PtySessionRegistry::new()),
            session,
        }
    }

    fn sh_args(script: &str) -> Vec<String> {
        vec!["/bin/sh".into(), "-c".into(), script.into()]
    }

    #[tokio::test]
    async fn mid_stream_marker_completes_a_live_pty_without_child_exit() {
        let h = harness().await;
        let session_id = h.session.id;
        let deps = SupervisedDeps {
            session_repo: Arc::clone(&h.session_repo),
            event_repo: Arc::clone(&h.event_repo),
            transcript_repo: Arc::clone(&h.transcript_repo),
            registry: Arc::clone(&h.registry),
            lifecycle_bus: None,
            idle_timeout: None,
            session_live: None,
        };
        // Print the completion marker, then block forever: the child never
        // exits, so only the mid-stream marker arm can terminate the session.
        let script = format!("printf '%s' '{MARKER_BLOCK}'; sleep 600");
        let result = tokio::time::timeout(
            Duration::from_secs(20),
            run_supervised(
                h.session,
                sh_args(&script),
                std::env::temp_dir(),
                Duration::from_secs(600),
                None,
                CancellationToken::new(),
                deps,
            ),
        )
        .await
        .expect("must complete via marker, not hang")
        .expect("supervised ok");

        assert!(matches!(
            result.lifecycle_phase,
            SessionLifecyclePhase::Completed { .. }
        ));
        let sr = result.step_result.expect("marker parsed").expect("present");
        assert_eq!(sr.summary, "mid-stream done");

        let reloaded = h
            .session_repo
            .get(session_id)
            .await
            .expect("get")
            .expect("present");
        assert_eq!(reloaded.status, AgentStatus::Completed);
    }

    #[tokio::test]
    async fn markerless_live_repl_is_bounded_by_the_idle_watchdog() {
        let h = harness().await;
        let deps = SupervisedDeps {
            session_repo: Arc::clone(&h.session_repo),
            event_repo: Arc::clone(&h.event_repo),
            transcript_repo: Arc::clone(&h.transcript_repo),
            registry: Arc::clone(&h.registry),
            lifecycle_bus: None,
            // The safety net the v1 revert restores: a quiet REPL that never
            // prints a marker is killed by the no-output watchdog.
            idle_timeout: Some(Duration::from_millis(300)),
            session_live: None,
        };
        // Emit one banner line (so the session is alive), then go silent forever
        // without ever printing a marker.
        let result = tokio::time::timeout(
            Duration::from_secs(20),
            run_supervised(
                h.session,
                sh_args("printf 'starting\\n'; sleep 600"),
                std::env::temp_dir(),
                Duration::from_secs(600),
                None,
                CancellationToken::new(),
                deps,
            ),
        )
        .await
        .expect("idle watchdog must bound a markerless REPL")
        .expect("supervised ok");

        assert!(matches!(
            result.lifecycle_phase,
            SessionLifecyclePhase::TimedOut
        ));
        assert!(result.step_result.expect("no marker").is_none());
    }

    #[tokio::test]
    async fn session_live_hook_fires_once_when_the_child_is_registered() {
        let h = harness().await;
        let fires = Arc::new(AtomicUsize::new(0));
        let fires_hook = Arc::clone(&fires);
        let deps = SupervisedDeps {
            session_repo: Arc::clone(&h.session_repo),
            event_repo: Arc::clone(&h.event_repo),
            transcript_repo: Arc::clone(&h.transcript_repo),
            registry: Arc::clone(&h.registry),
            lifecycle_bus: None,
            idle_timeout: None,
            session_live: Some(Box::new(move || {
                fires_hook.fetch_add(1, Ordering::SeqCst);
            })),
        };
        // A trivially-terminating child: spawn → register (hook fires) → exit.
        run_supervised(
            h.session,
            sh_args("exit 0"),
            std::env::temp_dir(),
            Duration::from_secs(10),
            None,
            CancellationToken::new(),
            deps,
        )
        .await
        .expect("supervised ok");

        assert_eq!(
            fires.load(Ordering::SeqCst),
            1,
            "session-live hook must fire exactly once per step"
        );
    }

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
    #[ignore = "spawns the real `claude` binary; run with --ignored"]
    async fn real_claude_pty_submits_injected_directive() {
        let home = std::env::var("HOME").expect("HOME");
        let claude = std::env::var("SUPERKICK_TEST_CLAUDE")
            .unwrap_or_else(|_| format!("{home}/.local/bin/claude"));
        if !std::path::Path::new(&claude).exists() {
            eprintln!("skip: claude not found at {claude}");
            return;
        }

        let h = harness().await;
        let run_id = h.session.run_id;
        let deps = SupervisedDeps {
            session_repo: Arc::clone(&h.session_repo),
            event_repo: Arc::clone(&h.event_repo),
            transcript_repo: Arc::clone(&h.transcript_repo),
            registry: Arc::clone(&h.registry),
            lifecycle_bus: None,
            // claude prints PONG then goes idle (no completion marker) — bound it.
            idle_timeout: Some(Duration::from_secs(10)),
            session_live: None,
        };

        // A FRESH temp dir is untrusted — claude would open its trust modal and
        // swallow the injection. run_supervised must seed trust (claude_trust)
        // so the directive still submits. This exercises the whole SUP-66 fix.
        let tmp = tempfile::tempdir().expect("tmp workdir");
        let workdir = tmp.path().to_path_buf();
        let directive = "__SUPERKICK_BACKEND_DIRECTIVE_v1__\n\
             Reply with exactly the single word PONG and nothing else. Do not use \
             any tools, do not read or edit files, do not run commands.\n";
        let args = vec![claude, "--dangerously-skip-permissions".into()];

        let result = tokio::time::timeout(
            Duration::from_secs(120),
            run_supervised(
                h.session,
                args,
                workdir.clone(),
                Duration::from_secs(110),
                Some(directive.to_string()),
                CancellationToken::new(),
                deps,
            ),
        )
        .await
        .expect("run_supervised must not hang")
        .expect("supervised ok");

        let chunks = h
            .transcript_repo
            .list_by_run(run_id)
            .await
            .expect("transcript");
        let mut bytes = Vec::new();
        for c in &chunks {
            bytes.extend_from_slice(&c.payload);
        }
        let text = String::from_utf8_lossy(&bytes);

        // Best-effort: drop the trust entry the seed added for this temp path so
        // the dev's ~/.claude.json doesn't accrue dead worktree keys.
        if let (Ok(cfg), Ok(key)) = (
            std::fs::read_to_string(format!("{home}/.claude.json")),
            workdir.canonicalize(),
        ) && let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&cfg)
            && let Some(projects) = v.get_mut("projects").and_then(|p| p.as_object_mut())
        {
            projects.remove(&key.to_string_lossy().into_owned());
            let _ = std::fs::write(
                format!("{home}/.claude.json"),
                serde_json::to_string_pretty(&v).unwrap_or(cfg),
            );
        }

        assert!(
            text.contains("PONG"),
            "injected directive was never submitted — no PONG in transcript. \
             lifecycle={:?}, transcript_len={}",
            result.lifecycle_phase,
            bytes.len()
        );
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
