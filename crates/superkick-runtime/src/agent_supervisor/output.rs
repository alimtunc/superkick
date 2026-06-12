//! PTY output streaming — reads the master side, broadcasts raw bytes, and persists transcript.
//!
//! The output reader broadcasts raw PTY bytes to all connected consumers (WebSocket terminals)
//! and persists chunks to durable transcript storage. Structured events (steps, state changes)
//! continue through the StepEngine; raw terminal bytes no longer go through SSE.

use std::sync::Arc;

use tokio::sync::{broadcast, mpsc, oneshot, watch};
use tracing::warn;

use superkick_core::{AgentProvider, RunId, StepResult, TranscriptChunk};
use superkick_storage::repo::TranscriptRepo;

use crate::protocol_adapter::{
    FailureHintScanner, MarkerError, StepResultScanner, TranscriptHints,
};
use crate::pty_io::read_pty_raw;
use crate::pty_session::PtySession;

/// Outcome the supervisor consumes from the output pipeline.
pub(crate) struct OutputPipeline {
    pub persist_join: tokio::task::JoinHandle<()>,
    /// Await after the child exits so the PTY EOF is guaranteed.
    pub step_result_rx: oneshot::Receiver<Result<Option<StepResult>, MarkerError>>,
    /// Provider-aware free-form hint scanner output. Independent of
    /// `step_result_rx`: both drain from the same PTY byte fan-out task.
    pub transcript_hints_rx: oneshot::Receiver<TranscriptHints>,
}

/// Spawn a PTY output reader that broadcasts raw bytes, persists transcript
/// chunks, and feeds both the step-result marker scanner and the failure-hint
/// scanner from the same byte fan-out.
pub(crate) fn spawn_output_reader<T>(
    reader: Box<dyn std::io::Read + Send>,
    run_id: RunId,
    provider: AgentProvider,
    session: Arc<PtySession>,
    broadcast_tx: broadcast::Sender<Vec<u8>>,
    transcript_repo: Arc<T>,
    // Pinged once per output chunk so the supervisor's no-output watchdog can
    // reset its idle window. `None` disables it.
    activity_tx: Option<watch::Sender<u64>>,
) -> OutputPipeline
where
    T: TranscriptRepo + 'static,
{
    let (persist_tx, persist_rx) = mpsc::channel::<Vec<u8>>(256);
    let (scan_tx, scan_rx) = mpsc::channel::<Vec<u8>>(256);
    let (step_result_tx, step_result_rx) = oneshot::channel();
    let (hints_tx, transcript_hints_rx) = oneshot::channel();

    let persist_join = tokio::spawn(persist_chunks(
        persist_rx,
        run_id,
        transcript_repo,
        activity_tx,
    ));
    tokio::spawn(scan_chunks(scan_rx, provider, step_result_tx, hints_tx));

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
        transcript_hints_rx,
    }
}

/// Async loop that receives raw chunks and persists them as transcript chunks.
/// Each chunk pings `activity_tx` so the no-output watchdog sees the agent is
/// alive; when the child exits the channel closes, dropping `activity_tx`, and
/// the watchdog defers to the exit arm.
async fn persist_chunks<T: TranscriptRepo>(
    mut rx: mpsc::Receiver<Vec<u8>>,
    run_id: RunId,
    transcript_repo: Arc<T>,
    activity_tx: Option<watch::Sender<u64>>,
) {
    let mut sequence: i64 = 0;
    while let Some(bytes) = rx.recv().await {
        if let Some(tx) = &activity_tx {
            tx.send_modify(|n| *n = n.wrapping_add(1));
        }
        let chunk = TranscriptChunk::new(run_id, sequence, bytes);
        if let Err(err) = transcript_repo.insert(&chunk).await {
            warn!("failed to persist transcript chunk: {err}");
        }
        sequence += 1;
    }
}

/// Drain raw PTY chunks into both the marker scanner and the provider-aware
/// failure-hint scanner, then forward each verdict when the sender closes.
///
/// First-wins on the step-result `oneshot`, but only on a *successful*
/// completion (`Ok(Some)`): the marker block is forwarded the instant `feed`
/// closes a valid one (so a self-iterating REPL that prints its completion JSON
/// but never exits still wakes the supervisor). A malformed (`Err`) or
/// not-yet-closed (`Ok(None)`) block does NOT consume the sender — scanning
/// continues so a later valid block can supersede it, and `finish()` reports
/// the final `last_complete`/error at EOF. This mirrors `await_completed_marker`
/// in lifecycle.rs, which only treats `Ok(Ok(Some(_)))` as a clean completion.
async fn scan_chunks(
    mut rx: mpsc::Receiver<Vec<u8>>,
    provider: AgentProvider,
    result_tx: oneshot::Sender<Result<Option<StepResult>, MarkerError>>,
    hints_tx: oneshot::Sender<TranscriptHints>,
) {
    let mut marker = StepResultScanner::new();
    let mut hints = FailureHintScanner::new(provider);
    let mut result_tx = Some(result_tx);
    while let Some(bytes) = rx.recv().await {
        if let Ok(Some(sr)) = marker.feed(&bytes) {
            if let Some(tx) = result_tx.take() {
                let _ = tx.send(Ok(Some(sr)));
            }
        }
        hints.feed(&bytes);
    }
    if let Some(tx) = result_tx.take() {
        let _ = tx.send(marker.finish());
    }
    let _ = hints_tx.send(hints.into_hints());
}

#[cfg(test)]
mod tests {
    use super::*;
    use superkick_core::{STEP_RESULT_BEGIN, STEP_RESULT_END, StepResultStatus};

    fn block(body: &str) -> Vec<u8> {
        format!("{STEP_RESULT_BEGIN}\n{body}\n{STEP_RESULT_END}\n").into_bytes()
    }

    #[tokio::test]
    async fn malformed_then_valid_block_completes_with_the_valid_one() {
        let (scan_tx, scan_rx) = mpsc::channel::<Vec<u8>>(8);
        let (result_tx, result_rx) = oneshot::channel();
        let (hints_tx, _hints_rx) = oneshot::channel();

        let scanner = tokio::spawn(scan_chunks(
            scan_rx,
            AgentProvider::Claude,
            result_tx,
            hints_tx,
        ));

        // First feed: a malformed block must NOT latch the oneshot.
        scan_tx
            .send(block("not json at all"))
            .await
            .expect("send malformed");
        // Second feed: a later valid block supersedes the malformed one.
        scan_tx
            .send(block(r#"{"status":"completed","summary":"recovered"}"#))
            .await
            .expect("send valid");
        drop(scan_tx);

        scanner.await.expect("scanner task");
        let outcome = result_rx.await.expect("sender not dropped");
        let sr = outcome.expect("not MalformedMarker").expect("some block");
        assert_eq!(sr.status, StepResultStatus::Completed);
        assert_eq!(sr.summary, "recovered");
    }
}
