//! OS-level process control for supervised agents.

use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use tokio::sync::broadcast;
use tracing::warn;

use superkick_core::RunId;

use crate::pty_session::PtySession;

/// Send SIGKILL to a process by PID.
///
/// Used for timeout/cancellation since `portable-pty::Child` has been moved
/// into the blocking wait task. Silently ignores ESRCH (process already exited).
pub(crate) fn kill_by_pid(pid: Option<u32>) {
    let Some(pid) = pid else { return };

    // SAFETY: libc::kill sends a signal to a process. We only call this with
    // a PID we own (the spawned child), and only during timeout/cancellation.
    let ret = unsafe { libc::kill(pid as i32, libc::SIGKILL) };
    if ret != 0 {
        let err = std::io::Error::last_os_error();
        if err.raw_os_error() != Some(libc::ESRCH) {
            warn!(pid, "failed to SIGKILL agent: {err}");
        }
    }
}

/// Result of opening a PTY pair and spawning a child on the slave side.
pub(crate) struct SpawnedPty {
    pub child: Box<dyn portable_pty::Child + Send + Sync>,
    pub master_reader: Box<dyn std::io::Read + Send>,
    pub session: Arc<PtySession>,
    pub broadcast_tx: broadcast::Sender<Vec<u8>>,
}

/// Open a 24x80 PTY pair, wire up a `PtySession`, and spawn `command` on the
/// slave. `pty_label` flavours the open/reader/writer error context (e.g.
/// `"PTY"` vs `"takeover PTY"`); `spawn_context` is the caller-built context
/// for the spawn itself so command-specific wording is preserved.
pub(crate) fn open_pty_and_spawn(
    run_id: RunId,
    command: CommandBuilder,
    pty_label: &str,
    spawn_context: &str,
) -> Result<SpawnedPty> {
    let pty_system = NativePtySystem::default();
    let pty_pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .with_context(|| format!("failed to open {pty_label} pair"))?;

    // Clone the master reader before spawning — avoids a race if the child exits fast.
    let master_reader = pty_pair
        .master
        .try_clone_reader()
        .with_context(|| format!("failed to clone {pty_label} master reader"))?;
    let master_writer = pty_pair
        .master
        .take_writer()
        .with_context(|| format!("failed to take {pty_label} master writer"))?;

    let (session, broadcast_tx) = PtySession::new(run_id, master_writer, pty_pair.master);

    let child = pty_pair
        .slave
        .spawn_command(command)
        .with_context(|| spawn_context.to_string())?;

    // Drop the slave — the child owns it now. Keeping it open would prevent
    // EOF on the master when the child exits.
    drop(pty_pair.slave);

    Ok(SpawnedPty {
        child,
        master_reader,
        session,
        broadcast_tx,
    })
}

/// Inject an opening payload into a freshly-spawned PTY once its startup UI has
/// settled, then submit it with a carriage return.
///
/// Runs on a detached task because `write_input` is a blocking `write_all`:
/// doing it inline on the async runtime would let an agent that is slow to
/// drain its stdin wedge a tokio worker (freezing the HTTP API) and bypass any
/// timeout. The PTY reader the caller started drains concurrently so the write
/// cannot deadlock; on kill the blocked write errors out and the task unwinds.
/// Best-effort: a failure is logged, not propagated — the operator can retype.
pub(crate) fn spawn_initial_input_injection(
    session: Arc<PtySession>,
    payload: String,
    run_id: RunId,
    output_rx: broadcast::Receiver<Vec<u8>>,
) {
    tokio::spawn(async move {
        wait_for_input_ready(output_rx).await;
        let injected = tokio::task::spawn_blocking(move || {
            session.write_input(payload.as_bytes())?;
            // Gap so Claude's TUI closes its paste-coalesce window: an Enter glued
            // to the multi-line burst is absorbed as paste content, not a submit.
            std::thread::sleep(Duration::from_millis(200));
            session.write_input(b"\r")
        })
        .await;
        match injected {
            Ok(Ok(())) => {}
            Ok(Err(err)) => warn!(
                run_id = %run_id,
                error = %err,
                "failed to inject opening input into PTY — operator must retype"
            ),
            Err(err) => warn!(run_id = %run_id, error = %err, "PTY input injection task panicked"),
        }
    });
}

/// Block until the freshly-spawned CLI has finished painting its startup UI
/// (welcome box, MCP load, release notices, trust/onboarding modals) and is
/// idle at a ready prompt. Detected by PTY output quiescence — once the master
/// has been silent for `QUIET`, the TUI has stopped repainting and the composer
/// is accepting input. Capped at `MAX` so a perpetually-animating TUI still
/// gets the prompt. A fixed delay raced a multi-second boot and dropped the
/// payload into a half-painted screen.
async fn wait_for_input_ready(mut output_rx: broadcast::Receiver<Vec<u8>>) {
    use broadcast::error::RecvError;
    const QUIET: Duration = Duration::from_millis(600);
    const MAX: Duration = Duration::from_secs(12);

    let cap = tokio::time::sleep(MAX);
    tokio::pin!(cap);
    loop {
        tokio::select! {
            _ = &mut cap => return,
            recv = output_rx.recv() => match recv {
                // New output: the TUI is still painting — reset the quiet window.
                Ok(_) | Err(RecvError::Lagged(_)) => continue,
                // Child exited before it ever idled; nothing to wait for.
                Err(RecvError::Closed) => return,
            },
            _ = tokio::time::sleep(QUIET) => return,
        }
    }
}
