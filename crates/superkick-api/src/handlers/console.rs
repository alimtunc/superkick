use axum::extract::{Path, State};
use axum::response::{IntoResponse, Json};
use serde::Deserialize;

use superkick_core::RunId;
use superkick_storage::repo::{RunEventRepo, RunRepo};

use crate::AppState;
use crate::error::AppError;

#[derive(Deserialize)]
pub struct ConsoleInputRequest {
    message: String,
}

pub async fn send_console_input(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
    Json(body): Json<ConsoleInputRequest>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);

    let Some(mut run) = state.run_repo.get(run_id).await? else {
        return Err(AppError::NotFound("run not found"));
    };

    let event = superkick_core::console::accept_operator_input(&mut run, &body.message)?;

    state.run_repo.update(&run).await?;
    state.event_repo.insert(&event).await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
