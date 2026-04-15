//! SUP-48 ownership endpoints.
//!
//! Read: snapshot + audit history. Writes: operator takeover/release. Other
//! transitions (suspend/resume on handoff/attention) are orchestrator-driven
//! and go through the service internally — they're not exposed as HTTP routes.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::{Deserialize, Serialize};

use superkick_core::{AgentSessionId, OperatorId, OwnershipEvent, RunId, SessionOwnership};
use superkick_runtime::OwnershipServiceError;
use superkick_storage::repo::RunRepo;

use crate::AppState;
use crate::error::AppError;

#[derive(Deserialize)]
pub struct TakeoverRequest {
    /// Free-form operator identifier — typically email or handle.
    operator_id: String,
    /// Optional short note shown in the audit trail.
    note: Option<String>,
}

#[derive(Deserialize)]
pub struct ReleaseRequest {
    operator_id: String,
}

#[derive(Serialize)]
pub struct OwnershipHistoryResponse {
    pub current: SessionOwnership,
    pub events: Vec<OwnershipEvent>,
}

/// `GET /runs/:run_id/sessions/:session_id/ownership`
pub async fn get_ownership(
    State(state): State<AppState>,
    Path((run_id, session_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(run_id);
    let session_id = AgentSessionId(session_id);

    if state.run_repo.get(run_id).await?.is_none() {
        return Err(AppError::NotFound("run not found"));
    }

    let current = state
        .ownership_service
        .snapshot(session_id)
        .await
        .map_err(to_app_error)?;
    let events = state
        .ownership_service
        .history(session_id)
        .await
        .map_err(AppError::Internal)?;

    Ok(Json(OwnershipHistoryResponse { current, events }))
}

/// `POST /runs/:run_id/sessions/:session_id/ownership/takeover`
pub async fn takeover(
    State(state): State<AppState>,
    Path((run_id, session_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(body): Json<TakeoverRequest>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(run_id);
    let session_id = AgentSessionId(session_id);
    validate_run(&state, run_id).await?;

    let operator_id = parse_operator(&body.operator_id)?;
    let note = body
        .note
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty());

    let snapshot = state
        .ownership_service
        .takeover(session_id, operator_id, note)
        .await
        .map_err(to_app_error)?;
    Ok((StatusCode::OK, Json(snapshot)))
}

/// `POST /runs/:run_id/sessions/:session_id/ownership/release`
pub async fn release(
    State(state): State<AppState>,
    Path((run_id, session_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(body): Json<ReleaseRequest>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(run_id);
    let session_id = AgentSessionId(session_id);
    validate_run(&state, run_id).await?;

    let operator_id = parse_operator(&body.operator_id)?;
    let snapshot = state
        .ownership_service
        .release(session_id, operator_id)
        .await
        .map_err(to_app_error)?;
    Ok((StatusCode::OK, Json(snapshot)))
}

fn parse_operator(raw: &str) -> Result<OperatorId, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("operator_id must not be empty".into()));
    }
    Ok(OperatorId(trimmed.to_string()))
}

async fn validate_run(state: &AppState, run_id: RunId) -> Result<(), AppError> {
    if state.run_repo.get(run_id).await?.is_none() {
        return Err(AppError::NotFound("run not found"));
    }
    Ok(())
}

fn to_app_error(err: OwnershipServiceError) -> AppError {
    match err {
        OwnershipServiceError::SessionNotFound(_) => AppError::NotFound("session not found"),
        OwnershipServiceError::Ownership(core_err) => AppError::BadRequest(core_err.to_string()),
        OwnershipServiceError::Storage(inner) => AppError::Internal(inner),
    }
}
