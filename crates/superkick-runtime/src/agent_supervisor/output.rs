//! PTY output streaming — reads the master side, broadcasts raw bytes, and persists transcript.
//!
//! The output reader broadcasts raw PTY bytes to all connected consumers (WebSocket terminals)
//! and persists chunks to durable transcript storage. Structured events (steps, state changes)
//! continue through the StepEngine; raw terminal bytes no longer go through SSE.

use std::io::Read as _;
use std::sync::Arc;

use tokio::sync::{broadcast, mpsc};
use tracing::warn;

use superkick_core::{EventKind, EventLevel, RunEvent, RunId, StepId, TranscriptChunk};
use superkick_storage::repo::{RunEventRepo, TranscriptRepo};

use crate::pty_session::PtySession;

/// Spawn a PTY output reader that broadcasts raw bytes and persists transcript chunks.
///
/// Returns a `JoinHandle` that completes when the PTY master reaches EOF.
pub(crate) fn spawn_output_reader<T>(
    reader: Box<dyn std::io::Read + Send>,
    run_id: RunId,
    session: Arc<PtySession>,
    broadcast_tx: broadcast::Sender<Vec<u8>>,
    transcript_repo: Arc<T>,
) -> tokio::task::JoinHandle<()>
where
    T: TranscriptRepo + 'static,
{
    let (tx, rx) = mpsc::channel::<Vec<u8>>(256);

    // Async task: drain raw chunks, persist to transcript storage.
    let emitter = tokio::spawn(persist_chunks(rx, run_id, transcript_repo));

    // Blocking task: read PTY master and broadcast + send for persistence.
    tokio::task::spawn_blocking(move || {
        read_pty_raw(reader, &session, &broadcast_tx, &tx);
        drop(tx);
    });

    // Return a handle that waits for the persistence task.
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

/// Async loop that receives raw chunks and persists them as transcript chunks.
async fn persist_chunks<T: TranscriptRepo>(
    mut rx: mpsc::Receiver<Vec<u8>>,
    run_id: RunId,
    transcript_repo: Arc<T>,
) {
    let mut sequence: i64 = 0;
    while let Some(bytes) = rx.recv().await {
        let chunk = TranscriptChunk::new(run_id, sequence, bytes);
        if let Err(err) = transcript_repo.insert(&chunk).await {
            warn!("failed to persist transcript chunk: {err}");
        }
        sequence += 1;
    }
}

/// Blocking loop that reads raw PTY output, broadcasts to subscribers, feeds scrollback,
/// and sends chunks for durable persistence.
fn read_pty_raw(
    mut reader: Box<dyn std::io::Read + Send>,
    session: &PtySession,
    broadcast_tx: &broadcast::Sender<Vec<u8>>,
    persist_tx: &mpsc::Sender<Vec<u8>>,
) {
    let mut buf = [0u8; 4096];

    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let chunk = buf[..n].to_vec();

                // Feed scrollback ring buffer.
                session.append_scrollback(&chunk);

                // Broadcast to connected terminals (ignore lag errors).
                let _ = broadcast_tx.send(chunk.clone());

                // Send for durable persistence.
                if persist_tx.blocking_send(chunk).is_err() {
                    return;
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
}
