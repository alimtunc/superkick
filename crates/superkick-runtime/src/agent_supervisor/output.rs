//! PTY output streaming — reads the master side, broadcasts raw bytes, and persists transcript.
//!
//! The output reader broadcasts raw PTY bytes to all connected consumers (WebSocket terminals)
//! and persists chunks to durable transcript storage. Structured events (steps, state changes)
//! continue through the StepEngine; raw terminal bytes no longer go through SSE.

use std::sync::Arc;

use tokio::sync::{broadcast, mpsc, oneshot};
use tracing::warn;

use superkick_core::{EventKind, EventLevel, RunEvent, RunId, StepId, StepResult, TranscriptChunk};
use superkick_storage::repo::{RunEventRepo, TranscriptRepo};

use crate::protocol_adapter::{MarkerError, StepResultScanner};
use crate::pty_io::read_pty_raw;
use crate::pty_session::PtySession;

/// Outcome the supervisor consumes from the output pipeline.
pub(crate) struct OutputPipeline {
    pub persist_join: tokio::task::JoinHandle<()>,
    /// Await after the child exits so the PTY EOF is guaranteed.
    pub step_result_rx: oneshot::Receiver<Result<Option<StepResult>, MarkerError>>,
}

/// Spawn a PTY output reader that broadcasts raw bytes, persists transcript
/// chunks, and feeds the step-result marker scanner.
pub(crate) fn spawn_output_reader<T>(
    reader: Box<dyn std::io::Read + Send>,
    run_id: RunId,
    session: Arc<PtySession>,
    broadcast_tx: broadcast::Sender<Vec<u8>>,
    transcript_repo: Arc<T>,
) -> OutputPipeline
where
    T: TranscriptRepo + 'static,
{
    let (persist_tx, persist_rx) = mpsc::channel::<Vec<u8>>(256);
    let (scan_tx, scan_rx) = mpsc::channel::<Vec<u8>>(256);
    let (step_result_tx, step_result_rx) = oneshot::channel();

    let persist_join = tokio::spawn(persist_chunks(persist_rx, run_id, transcript_repo));
    tokio::spawn(scan_marker(scan_rx, step_result_tx));

    tokio::task::spawn_blocking(move || {
        read_pty_raw(
            reader,
            &session,
            &broadcast_tx,
            Some(&persist_tx),
            Some(&scan_tx),
        );
        drop(persist_tx);
        drop(scan_tx);
    });

    OutputPipeline {
        persist_join,
        step_result_rx,
    }
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

/// Drain raw PTY chunks into a scanner and send the verdict when the sender closes.
async fn scan_marker(
    mut rx: mpsc::Receiver<Vec<u8>>,
    result_tx: oneshot::Sender<Result<Option<StepResult>, MarkerError>>,
) {
    let mut scanner = StepResultScanner::new();
    while let Some(bytes) = rx.recv().await {
        scanner.feed(&bytes);
    }
    let _ = result_tx.send(scanner.finish());
}
