//! HTTP surface for structured attention requests.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::Deserialize;

use superkick_core::{AttentionKind, AttentionReply, AttentionRequestId, RunId};
use superkick_storage::repo::AttentionRequestRepo;

use super::require_run;
use crate::AppState;
use crate::error::AppError;

#[derive(Deserialize)]
pub struct CreateAttentionRequest {
    pub kind: AttentionKind,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub options: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub struct AttentionReplyRequest {
    #[serde(flatten)]
    pub reply: AttentionReply,
    #[serde(default)]
    pub replied_by: Option<String>,
}

pub async fn list_attention_requests(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);
    require_run(&state, run_id).await?;
    let requests = state.attention_repo.list_by_run(run_id).await?;
    Ok(Json(requests))
}

pub async fn create_attention_request(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
    Json(body): Json<CreateAttentionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);
    require_run(&state, run_id).await?;
    let request = state
        .attention_service
        .create(run_id, body.kind, body.title, body.body, body.options)
        .await
        .map_err(AppError::from)?;
    Ok((StatusCode::CREATED, Json(request)))
}

pub async fn reply_attention_request(
    State(state): State<AppState>,
    Path((run_id, request_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(body): Json<AttentionReplyRequest>,
) -> Result<impl IntoResponse, AppError> {
    let request = state
        .attention_service
        .reply(
            RunId(run_id),
            AttentionRequestId(request_id),
            body.reply,
            body.replied_by,
        )
        .await
        .map_err(AppError::from)?;
    Ok(Json(request))
}

pub async fn cancel_attention_request(
    State(state): State<AppState>,
    Path((run_id, request_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    let request = state
        .attention_service
        .cancel(RunId(run_id), AttentionRequestId(request_id))
        .await
        .map_err(AppError::from)?;
    Ok(Json(request))
}
