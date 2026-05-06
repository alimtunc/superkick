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
/// `persist_tx` is `Some`) fan chunks out for durable persistence.
///
/// The takeover service passes `None` because takeover PTYs are not persisted
/// to the transcript chunk stream — only the run's primary PTY is.
pub(crate) fn read_pty_raw(
    mut reader: Box<dyn std::io::Read + Send>,
    session: &PtySession,
    broadcast_tx: &broadcast::Sender<Vec<u8>>,
    persist_tx: Option<&mpsc::Sender<Vec<u8>>>,
) {
    use std::io::Read as _;
    let mut buf = [0u8; PTY_READ_BUF];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                let chunk = buf[..n].to_vec();
                session.append_scrollback(&chunk);
                match persist_tx {
                    Some(tx) => {
                        let _ = broadcast_tx.send(chunk.clone());
                        if tx.blocking_send(chunk).is_err() {
                            return;
                        }
                    }
                    None => {
                        let _ = broadcast_tx.send(chunk);
                    }
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
