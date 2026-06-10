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

use super::broadcast_sse;
use crate::AppState;
use crate::error::AppError;

pub async fn workspace_events(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let rx = state.workspace_bus.subscribe();
    Ok(broadcast_sse(rx, "workspace_event", |_| true))
}
