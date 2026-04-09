//! PTY output streaming — reads the master side and emits `AgentOutput` events.
//!
//! Uses an mpsc channel to decouple the blocking PTY reader from async event emission.

use std::io::Read as _;
use std::sync::Arc;

use tokio::sync::mpsc;
use tracing::warn;

use superkick_core::{EventKind, EventLevel, RunEvent, RunId, StepId};
use superkick_storage::repo::RunEventRepo;

/// Maximum size of the line buffer before forced flush (64 KiB).
const MAX_LINE_LEN: usize = 64 * 1024;

/// Spawn a PTY output reader that emits `AgentOutput` events incrementally.
///
/// Returns a `JoinHandle` that completes when the PTY master reaches EOF.
/// The blocking reader sends lines through an mpsc channel to an async task
/// that persists them as events.
pub(crate) fn spawn_output_reader<E: RunEventRepo + 'static>(
    reader: Box<dyn std::io::Read + Send>,
    run_id: RunId,
    step_id: StepId,
    event_repo: Arc<E>,
) -> tokio::task::JoinHandle<()> {
    let (tx, rx) = mpsc::channel::<String>(256);

    // Async task: drain lines from the channel and emit events.
    let emitter = tokio::spawn(emit_lines(rx, run_id, step_id, event_repo));

    // Blocking task: read PTY master and send lines through the channel.
    tokio::task::spawn_blocking(move || {
        read_pty_lines(reader, &tx);
        drop(tx); // signal completion to the emitter
    });

    // Return a handle that waits for the emitter (which waits for the reader via channel close).
    emitter
}

/// Emit a single run event, logging on failure.
pub(crate) async fn emit_event<E: RunEventRepo>(
    repo: &E,
    run_id: RunId,
    step_id: StepId,
    kind: EventKind,
    level: EventLevel,
    message: String,
) {
    let event = RunEvent::new(run_id, Some(step_id), kind, level, message);
    if let Err(err) = repo.insert(&event).await {
        warn!("failed to emit run event: {err}");
    }
}

/// Async loop that receives lines and persists them as `AgentOutput` events.
async fn emit_lines<E: RunEventRepo>(
    mut rx: mpsc::Receiver<String>,
    run_id: RunId,
    step_id: StepId,
    event_repo: Arc<E>,
) {
    while let Some(line) = rx.recv().await {
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

/// Blocking loop that reads PTY output chunk-by-chunk and sends complete lines.
fn read_pty_lines(mut reader: Box<dyn std::io::Read + Send>, tx: &mpsc::Sender<String>) {
    let mut buf = [0u8; 4096];
    let mut leftover = String::new();

    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let chunk = String::from_utf8_lossy(&buf[..n]);
                leftover.push_str(&chunk);

                flush_complete_lines(&mut leftover, tx);

                // Guard against output with no newlines (binary, progress bars).
                if leftover.len() > MAX_LINE_LEN {
                    let truncated = std::mem::take(&mut leftover);
                    let _ = tx.blocking_send(truncated);
                }
            }
            Err(err) => {
                // EIO is expected when the child exits and the PTY slave closes.
                if err.kind() != std::io::ErrorKind::Other {
                    warn!("PTY read error: {err}");
                }
                break;
            }
        }
    }

    // Flush any remaining partial line.
    let remaining = leftover.trim().to_string();
    if !remaining.is_empty() {
        let _ = tx.blocking_send(remaining);
    }
}

/// Extract and send all complete lines from the buffer.
fn flush_complete_lines(leftover: &mut String, tx: &mpsc::Sender<String>) {
    while let Some(newline_pos) = leftover.find('\n') {
        let line = leftover[..newline_pos].trim_end_matches('\r').to_string();
        *leftover = leftover[newline_pos + 1..].to_string();

        if line.is_empty() {
            continue;
        }

        if tx.blocking_send(line).is_err() {
            return; // receiver dropped — stop reading
        }
    }
}
