//! Shared process-lifecycle plumbing for the structured protocol adapters.
//!
//! The Claude and Codex adapters drive their providers through an identical
//! spawn → pump → terminate loop; only their NDJSON/JSONL stream parsing
//! genuinely differs. Everything here is provider-neutral and parameterised on
//! a `provider` label so the only "claude"/"codex" words in log/timeout
//! strings come from the caller.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use chrono::Utc;
use tokio::process::Child;
use tokio::time::timeout;
use tracing::{debug, warn};

use superkick_core::{
    Cancelled, Failure, ProtocolEvent, ProtocolEventEnvelope, ResumeKey, TurnOutcome,
};

use super::ProtocolEventSender;

const CANCEL_REASON_OPERATOR: &str = "operator";

/// Why the pump loop is tearing the turn down out-of-band.
#[derive(Debug)]
pub(crate) enum Termination {
    Cancelled,
    Timeout,
}

/// Push a stderr line into the bounded rolling tail, dropping the oldest line
/// once `capacity` is reached.
pub(crate) fn append_stderr_tail(tail: &mut VecDeque<String>, capacity: usize, line: String) {
    if capacity == 0 {
        return;
    }
    if tail.len() == capacity {
        tail.pop_front();
    }
    tail.push_back(line);
}

/// SIGTERM the child, give it 2s to flush its final line, then SIGKILL.
pub(crate) async fn kill_with_grace(provider: &str, child: &mut Child) {
    let pid = match child.id() {
        Some(pid) => pid,
        None => return,
    };

    // SIGTERM first — gives the provider a chance to flush its final line.
    // SAFETY: `libc::kill` with a non-negative pid sends a signal to a single
    // process. The pid came straight from this child handle, so the call is
    // bounded to the child we own.
    unsafe {
        libc::kill(pid as i32, libc::SIGTERM);
    }

    if matches!(
        timeout(Duration::from_secs(2), child.wait()).await,
        Ok(Ok(_))
    ) {
        return;
    }

    debug!(
        pid,
        "{provider} child did not exit within 2s of SIGTERM, sending SIGKILL"
    );
    if let Err(err) = child.start_kill() {
        warn!(error = %err, "{provider} start_kill failed");
    }
    let _ = timeout(Duration::from_secs(1), child.wait()).await;
}

/// Send one envelope through the consumer channel, logging (not failing) when
/// the consumer has dropped the receiver.
pub(crate) async fn send_event(
    provider: &str,
    tx: &ProtocolEventSender,
    seq: &AtomicU64,
    event: ProtocolEvent,
) {
    let envelope = ProtocolEventEnvelope {
        seq: seq.fetch_add(1, Ordering::Relaxed),
        at: Utc::now(),
        event,
    };
    if let Err(err) = tx.send(envelope).await {
        debug!(
            error = %err,
            "{provider} protocol consumer dropped the event receiver",
        );
    }
}

/// Emit the terminal `Cancelled`/`Failure` event for an out-of-band teardown
/// and return the matching `TurnOutcome`.
pub(crate) async fn emit_terminal(
    provider: &str,
    tx: &ProtocolEventSender,
    seq: &AtomicU64,
    termination: Termination,
    resume_key: Option<ResumeKey>,
    timeout_dur: Option<Duration>,
    stderr_tail: &VecDeque<String>,
) -> TurnOutcome {
    match termination {
        Termination::Cancelled => {
            send_event(
                provider,
                tx,
                seq,
                ProtocolEvent::Cancelled(Cancelled {
                    reason: CANCEL_REASON_OPERATOR.to_string(),
                }),
            )
            .await;
            TurnOutcome::Cancelled {
                resume_key,
                reason: CANCEL_REASON_OPERATOR.to_string(),
            }
        }
        Termination::Timeout => {
            let mut message = match timeout_dur {
                Some(d) => format!("{provider} turn timed out after {d:?}"),
                None => format!("{provider} turn timed out"),
            };
            if !stderr_tail.is_empty() {
                let tail = stderr_tail
                    .iter()
                    .map(String::as_str)
                    .collect::<Vec<_>>()
                    .join("\n");
                message.push_str(": ");
                message.push_str(&tail);
            }
            let code = "timeout".to_string();
            send_event(
                provider,
                tx,
                seq,
                ProtocolEvent::Failure(Failure {
                    code: code.clone(),
                    message: message.clone(),
                    usage: None,
                }),
            )
            .await;
            TurnOutcome::Failed {
                resume_key,
                code,
                message,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn append_stderr_tail_drops_oldest_when_full() {
        let mut tail = VecDeque::with_capacity(2);
        append_stderr_tail(&mut tail, 2, "a".into());
        append_stderr_tail(&mut tail, 2, "b".into());
        append_stderr_tail(&mut tail, 2, "c".into());
        assert_eq!(tail.iter().cloned().collect::<Vec<_>>(), vec!["b", "c"]);
    }
}
