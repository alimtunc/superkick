//! OS-level process control for supervised agents.

use std::sync::Arc;

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

/// Inject an opening payload into a freshly-spawned PTY after a short delay,
/// then submit it with a carriage return.
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
) {
    tokio::spawn(async move {
        // Both `claude` and `codex` print a welcome banner before accepting
        // input; without this brief pause the injected prefix lands inside the
        // banner instead of the prompt box.
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        let injected = tokio::task::spawn_blocking(move || {
            session.write_input(payload.as_bytes())?;
            // `\r` is the canonical Enter in raw mode; submits the line.
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
