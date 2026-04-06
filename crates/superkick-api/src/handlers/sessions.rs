use axum::extract::{Path, State};
use axum::response::{IntoResponse, Json};

use superkick_core::{AgentSessionId, RunId};
use superkick_storage::repo::{AgentSessionRepo, RunEventRepo, RunRepo};

use crate::AppState;
use crate::error::AppError;

pub async fn prepare_attach(
    State(state): State<AppState>,
    Path((run_id, session_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(run_id);
    let session_id = AgentSessionId(session_id);

    let Some(run) = state.run_repo.get(run_id).await? else {
        return Err(AppError::NotFound("run not found"));
    };

    let Some(session) = state.session_repo.get(session_id).await? else {
        return Err(AppError::NotFound("session not found"));
    };

    let (payload, event) = superkick_core::attach::prepare_attach(&run, &session)?;
    state.event_repo.insert(&event).await?;

    Ok(Json(payload))
}
