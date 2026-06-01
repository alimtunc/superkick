//! WebSocket terminal handler — attaches the browser to a live PTY session.
//!
//! Two callers go through `attach_session` here:
//! - The legacy run-primary PTY (`GET /runs/{id}/terminal`) for runs that
//!   were spawned via the agent supervisor.
//! - SUP-101 takeover PTYs (`GET /runs/{id}/terminal/{takeover_id}`), each
//!   with their own `WriterHolder` lease so two browsers can drive two
//!   terminals at once on the same run without trampling each other.

use std::sync::Arc;

use axum::extract::ws::{CloseFrame, Message, WebSocket};
use axum::extract::{Path, State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

use superkick_core::{RunId, TakeoverSessionId};
use superkick_runtime::{PtySession, WriterHolder};
use superkick_storage::repo::{RunRepo, TranscriptRepo};

use crate::AppState;
use crate::error::AppError;

/// Return the durable terminal transcript for a run (used when no live session exists).
pub async fn get_terminal_history(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);

    let Some(_run) = state.run_repo.get(run_id).await? else {
        return Err(AppError::NotFound("run not found"));
    };

    let chunks = state.transcript_repo.list_by_run(run_id).await?;

    let total_size: usize = chunks.iter().map(|chunk| chunk.payload.len()).sum();
    let mut payload = Vec::with_capacity(total_size);
    for chunk in &chunks {
        payload.extend_from_slice(&chunk.payload);
    }

    Ok((
        [(axum::http::header::CONTENT_TYPE, "application/octet-stream")],
        payload,
    ))
}

/// Upgrade to WebSocket and attach to the live PTY session for a run.
pub async fn attach_terminal(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
    ws: WebSocketUpgrade,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);

    let Some(_run) = state.run_repo.get(run_id).await? else {
        return Err(AppError::NotFound("run not found"));
    };

    let Some(session) = state.pty_registry.get(run_id) else {
        return Err(AppError::NotFound("no live PTY session for this run"));
    };

    Ok(ws.on_upgrade(move |socket| attach_session(session, socket)))
}

/// Upgrade to WebSocket and attach to a SUP-101 takeover PTY session.
pub async fn attach_takeover_terminal(
    State(state): State<AppState>,
    Path((run_id, takeover_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    ws: WebSocketUpgrade,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(run_id);
    let takeover_id = TakeoverSessionId(takeover_id);

    let Some(entry) = state.pty_registry.get_takeover(takeover_id) else {
        return Err(AppError::NotFound("no live takeover session"));
    };

    if entry.run_id != run_id {
        return Err(AppError::NotFound("takeover does not belong to this run"));
    }

    let session = entry.session;
    Ok(ws.on_upgrade(move |socket| attach_session(session, socket)))
}

// ── Internal types ───────────────────────────────────────────────────

#[derive(Serialize)]
struct CapabilitiesMessage {
    #[serde(rename = "type")]
    msg_type: &'static str,
    writable: bool,
    reason: &'static str,
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum ClientControl {
    #[serde(rename = "resize")]
    Resize { cols: u16, rows: u16 },
}

// ── Socket handler ───────────────────────────────────────────────────

/// Drive the WebSocket lifecycle against a live `PtySession`. Acquires a
/// fresh writer lease for the connection, replays the scrollback, then fans
/// broadcast bytes out and pumps client input/control back. Shared by the
/// run-primary WS and SUP-101 takeover WS so the writer-lease semantics stay
/// identical across both surfaces.
async fn attach_session(session: Arc<PtySession>, socket: WebSocket) {
    let holder_id = uuid::Uuid::new_v4().to_string();
    let holder = WriterHolder::Browser(holder_id);

    let writable = session.acquire_writer(holder.clone());
    let broadcast_rx = session.subscribe();
    let scrollback = session.scrollback_snapshot();

    handle_terminal_socket(socket, session, broadcast_rx, scrollback, writable, holder).await;
}

async fn handle_terminal_socket(
    socket: WebSocket,
    session: Arc<PtySession>,
    mut broadcast_rx: broadcast::Receiver<Vec<u8>>,
    scrollback: Vec<u8>,
    writable: bool,
    holder: WriterHolder,
) {
    let (mut sender, mut receiver) = socket.split();

    let caps = CapabilitiesMessage {
        msg_type: "capabilities",
        writable,
        reason: if writable {
            "writer lease acquired"
        } else {
            "another writer is active"
        },
    };
    if let Ok(json) = serde_json::to_string(&caps) {
        if sender.send(Message::Text(json.into())).await.is_err() {
            session.release_writer(&holder);
            return;
        }
    }

    if !scrollback.is_empty()
        && sender
            .send(Message::Binary(scrollback.into()))
            .await
            .is_err()
    {
        session.release_writer(&holder);
        return;
    }

    let session_for_input = Arc::clone(&session);

    loop {
        tokio::select! {
            result = broadcast_rx.recv() => {
                match result {
                    Ok(bytes) => {
                        let data: bytes::Bytes = bytes.into();
                        if sender.send(Message::Binary(data)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        tracing::warn!(skipped, "terminal WebSocket client lagged");
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        let _ = sender.send(Message::Close(Some(CloseFrame {
                            code: 4001,
                            reason: "PTY session terminated".into(),
                        }))).await;
                        break;
                    }
                }
            }
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Binary(data))) if writable => {
                        if let Err(err) = session_for_input.write_input(&data) {
                            tracing::warn!("PTY write failed: {err}");
                            break;
                        }
                    }
                    Some(Ok(Message::Binary(_))) => {}
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(ctrl) = serde_json::from_str::<ClientControl>(&text) {
                            match ctrl {
                                ClientControl::Resize { cols, rows } => {
                                    session_for_input.resize(cols, rows);
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }

    session.release_writer(&holder);
}
