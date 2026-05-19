//! Shared PTY reader for the agent supervisor and the takeover service.
//!
//! Both call sites used to inline the same 4 KiB read loop with the same
//! EIO-skip heuristic. Centralising it keeps the broadcast/scrollback fan-out
//! consistent and the persist-or-not difference parameterised on a single
//! optional `mpsc::Sender`.

use tokio::sync::{broadcast, mpsc};
use tracing::warn;

use crate::pty_session::PtySession;

const PTY_READ_BUF: usize = 4096;

/// Blocking PTY reader: feed scrollback, broadcast to terminals, and (when
/// the optional channels are `Some`) fan chunks out for durable persistence
/// and SUP-139 step-result marker scanning.
///
/// The takeover service passes `None` for both because takeover PTYs are not
/// persisted to the transcript chunk stream or scanned for completion
/// markers — only the run's primary PTY is.
pub(crate) fn read_pty_raw(
    mut reader: Box<dyn std::io::Read + Send>,
    session: &PtySession,
    broadcast_tx: &broadcast::Sender<Vec<u8>>,
    persist_tx: Option<&mpsc::Sender<Vec<u8>>>,
    step_result_tx: Option<&mpsc::Sender<Vec<u8>>>,
) {
    use std::io::Read as _;
    let mut buf = [0u8; PTY_READ_BUF];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let chunk = buf[..n].to_vec();
                session.append_scrollback(&chunk);
                let _ = broadcast_tx.send(chunk.clone());
                if let Some(tx) = step_result_tx {
                    // Best-effort: a closed scanner channel must not stop
                    // persistence or block the reader.
                    let _ = tx.blocking_send(chunk.clone());
                }
                if let Some(tx) = persist_tx
                    && tx.blocking_send(chunk).is_err()
                {
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
