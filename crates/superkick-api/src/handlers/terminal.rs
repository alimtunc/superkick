//! WebSocket terminal handler — attaches the browser to a live PTY session.

use std::sync::Arc;

use axum::extract::ws::{CloseFrame, Message, WebSocket};
use axum::extract::{Path, State, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

use superkick_core::RunId;
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

    let holder_id = uuid::Uuid::new_v4().to_string();
    let holder = WriterHolder::Browser(holder_id);

    let writable = session.acquire_writer(holder.clone());
    let broadcast_rx = session.subscribe();
    let scrollback = session.scrollback_snapshot();

    Ok(ws.on_upgrade(move |socket| {
        handle_terminal_socket(socket, session, broadcast_rx, scrollback, writable, holder)
    }))
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

async fn handle_terminal_socket(
    socket: WebSocket,
    session: Arc<PtySession>,
    mut broadcast_rx: broadcast::Receiver<Vec<u8>>,
    scrollback: Vec<u8>,
    writable: bool,
    holder: WriterHolder,
) {
    let (mut sender, mut receiver) = socket.split();

    // Send capabilities message.
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

    // Send scrollback as a single binary message.
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
                    Some(Ok(Message::Binary(data))) => {
                        if writable {
                            if let Err(err) = session_for_input.write_input(&data) {
                                tracing::warn!("PTY write failed: {err}");
                                break;
                            }
                        }
                    }
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
