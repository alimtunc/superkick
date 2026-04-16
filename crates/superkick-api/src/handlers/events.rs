//! Workspace-level run event feed (SUP-84).
//!
//! A single SSE endpoint that streams every `WorkspaceRunEvent` published on
//! the in-process `WorkspaceEventBus`. The frontend shell broker consumes
//! this instead of opening per-run `/runs/{id}/events` streams — one
//! subscription supports watched-session rails, attention counters, and any
//! future multi-run supervision surface.
//!
//! Durability: the bus is ephemeral. Persisted `run_events` /
//! `session_lifecycle_events` tables remain authoritative — on `Lagged` the
//! handler emits a `lagged` SSE event so the client can reconcile by
//! refetching affected runs.

use axum::extract::State;
use axum::response::IntoResponse;
use axum::response::sse::{Event, KeepAlive, Sse};
use tokio::sync::broadcast::error::RecvError;

use crate::AppState;
use crate::error::AppError;

pub async fn workspace_events(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let mut rx = state.workspace_bus.subscribe();

    let stream = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    let data = match serde_json::to_string(&event) {
                        Ok(d) => d,
                        Err(e) => {
                            yield Ok::<Event, std::convert::Infallible>(
                                Event::default().event("error").data(e.to_string())
                            );
                            continue;
                        }
                    };
                    yield Ok(Event::default().event("workspace_event").data(data));
                }
                Err(RecvError::Lagged(skipped)) => {
                    // The client missed `skipped` events. They should reconcile
                    // by refetching the affected runs; the audit log is the
                    // source of truth.
                    yield Ok(
                        Event::default()
                            .event("lagged")
                            .data(skipped.to_string()),
                    );
                }
                Err(RecvError::Closed) => {
                    // Bus closed — sender dropped, server shutting down.
                    yield Ok(Event::default().event("done").data("bus closed"));
                    break;
                }
            }
        }
    };

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}
