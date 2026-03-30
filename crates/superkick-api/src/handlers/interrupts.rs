use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};

use superkick_core::{InterruptAction, InterruptId, RunId};
use superkick_storage::repo::{InterruptRepo, RunRepo};

use crate::AppState;
use crate::error::AppError;

pub async fn list_interrupts(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);
    let run = state.run_repo.get(run_id).await?;
    if run.is_none() {
        return Err(AppError::NotFound("run not found"));
    }
    let interrupts = state.interrupt_repo.list_by_run(run_id).await?;
    Ok(Json(interrupts))
}

pub async fn answer_interrupt(
    State(state): State<AppState>,
    Path((run_id, interrupt_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(action): Json<InterruptAction>,
) -> Result<impl IntoResponse, AppError> {
    state
        .interrupt_service
        .answer_interrupt(RunId(run_id), InterruptId(interrupt_id), action)
        .await?;
    Ok(StatusCode::OK)
}
