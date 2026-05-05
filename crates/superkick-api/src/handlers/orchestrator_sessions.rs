//! SUP-102: orchestrator session HTTP handlers.
//!
//! No business logic — these handlers translate JSON to/from
//! `superkick_core::OrchestratorSession` and delegate persistence. State
//! transitions are validated by the domain (`OrchestratorStatus::transition_to`)
//! and surfaced as 409 here. Validation of payload shape (empty title, empty
//! issue identifier, …) is also delegated to the domain via constructors so
//! the rules live in one place.

use std::sync::Arc;

use axum::extract::{FromRef, Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::{Deserialize, Serialize};

use superkick_core::{
    AgentProvider, EventId, HandoffId, OperatorId, OrchestratorCheckpoint, OrchestratorScope,
    OrchestratorSession, OrchestratorSessionId, OrchestratorStatus, RunId, RuntimeProviderId,
};
use superkick_storage::SqliteOrchestratorSessionRepo;
use superkick_storage::repo::OrchestratorSessionRepo;

use crate::AppState;
use crate::error::AppError;

const SESSION_NOT_FOUND: &str = "orchestrator session not found";

/// Substate slice the orchestrator-session handlers actually need. Letting
/// axum extract this directly (via `FromRef`) keeps the handlers usable from
/// integration tests without rebuilding the full `AppState`.
pub type OrchestratorRepoState = Arc<SqliteOrchestratorSessionRepo>;

impl FromRef<AppState> for OrchestratorRepoState {
    fn from_ref(state: &AppState) -> Self {
        Arc::clone(&state.orchestrator_session_repo)
    }
}

#[derive(Deserialize)]
pub struct CreateSessionRequest {
    pub title: String,
    pub provider: AgentProvider,
    #[serde(default)]
    pub runtime_provider_id: Option<RuntimeProviderId>,
    pub owner: String,
    #[serde(default)]
    pub scope: OrchestratorScope,
}

pub async fn create_session(
    State(repo): State<OrchestratorRepoState>,
    Json(body): Json<CreateSessionRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Owner trimming is a transport-shape detail (the API accepts whitespace
    // padding to be forgiving of CLI input); the non-empty rule itself lives
    // in `OrchestratorSession::new` so create and patch can't drift.
    let session = OrchestratorSession::new(
        body.title,
        body.provider,
        body.runtime_provider_id,
        OperatorId(body.owner.trim().to_string()),
        body.scope,
    )?;
    repo.insert(&session).await?;
    Ok((StatusCode::CREATED, Json(session)))
}

#[derive(Deserialize)]
pub struct ListSessionsQuery {
    #[serde(default)]
    pub status: Option<OrchestratorStatus>,
    #[serde(default)]
    pub issue_identifier: Option<String>,
}

pub async fn list_sessions(
    State(repo): State<OrchestratorRepoState>,
    Query(q): Query<ListSessionsQuery>,
) -> Result<Json<Vec<OrchestratorSession>>, AppError> {
    let sessions = match (q.status, q.issue_identifier.as_deref()) {
        (Some(status), None) => repo.list_by_status(status).await?,
        (None, Some(issue)) => repo.list_by_issue_identifier(issue).await?,
        (Some(status), Some(issue)) => repo
            .list_by_issue_identifier(issue)
            .await?
            .into_iter()
            .filter(|s| s.status == status)
            .collect(),
        (None, None) => repo.list_all().await?,
    };
    Ok(Json(sessions))
}

#[derive(Serialize)]
pub struct SessionDetail {
    pub session: OrchestratorSession,
    pub latest_checkpoint: Option<OrchestratorCheckpoint>,
}

pub async fn get_session(
    State(repo): State<OrchestratorRepoState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<SessionDetail>, AppError> {
    let session_id = OrchestratorSessionId(id);
    let session = repo
        .get(session_id)
        .await?
        .ok_or(AppError::NotFound(SESSION_NOT_FOUND))?;
    let latest_checkpoint = repo.latest_checkpoint(session_id).await?;
    Ok(Json(SessionDetail {
        session,
        latest_checkpoint,
    }))
}

#[derive(Deserialize, Default)]
pub struct PatchSessionRequest {
    #[serde(default)]
    pub status: Option<OrchestratorStatus>,
    #[serde(default)]
    pub scope: Option<OrchestratorScope>,
    #[serde(default)]
    pub provider_session_id: Option<String>,
    #[serde(default)]
    pub last_event_cursor: Option<EventId>,
}

pub async fn patch_session(
    State(repo): State<OrchestratorRepoState>,
    Path(id): Path<uuid::Uuid>,
    Json(body): Json<PatchSessionRequest>,
) -> Result<Json<OrchestratorSession>, AppError> {
    let session_id = OrchestratorSessionId(id);
    let mut session = repo
        .get(session_id)
        .await?
        .ok_or(AppError::NotFound(SESSION_NOT_FOUND))?;

    // Each setter validates and bumps `updated_at`; transition errors flow
    // through `CoreError::InvalidOrchestratorTransition` -> 409.
    if let Some(target) = body.status {
        session.transition_to(target)?;
    }
    if let Some(scope) = body.scope {
        session.set_scope(scope)?;
    }
    if let Some(provider_session_id) = body.provider_session_id {
        session.set_provider_session_id(provider_session_id);
    }
    if let Some(cursor) = body.last_event_cursor {
        session.set_last_event_cursor(cursor);
    }

    repo.update(&session).await?;
    Ok(Json(session))
}

#[derive(Deserialize)]
pub struct CreateCheckpointRequest {
    pub summary: String,
    #[serde(default)]
    pub covers_from_event: Option<EventId>,
    #[serde(default)]
    pub covers_to_event: Option<EventId>,
    #[serde(default)]
    pub decisions: Vec<String>,
    #[serde(default)]
    pub open_questions: Vec<String>,
    #[serde(default)]
    pub child_run_ids: Vec<RunId>,
    #[serde(default)]
    pub child_handoff_ids: Vec<HandoffId>,
}

pub async fn create_checkpoint(
    State(repo): State<OrchestratorRepoState>,
    Path(id): Path<uuid::Uuid>,
    Json(body): Json<CreateCheckpointRequest>,
) -> Result<impl IntoResponse, AppError> {
    let session_id = OrchestratorSessionId(id);

    // Existence check upfront — return 404 instead of letting the FK error
    // surface as 500.
    if repo.get(session_id).await?.is_none() {
        return Err(AppError::NotFound(SESSION_NOT_FOUND));
    }

    let checkpoint = OrchestratorCheckpoint::new(
        session_id,
        body.summary,
        body.covers_from_event,
        body.covers_to_event,
        body.decisions,
        body.open_questions,
        body.child_run_ids,
        body.child_handoff_ids,
    )?;

    repo.insert_checkpoint(&checkpoint).await?;

    Ok((StatusCode::CREATED, Json(checkpoint)))
}

pub async fn list_checkpoints(
    State(repo): State<OrchestratorRepoState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<Vec<OrchestratorCheckpoint>>, AppError> {
    let session_id = OrchestratorSessionId(id);
    if repo.get(session_id).await?.is_none() {
        return Err(AppError::NotFound(SESSION_NOT_FOUND));
    }
    let checkpoints = repo.list_checkpoints_by_session(session_id).await?;
    Ok(Json(checkpoints))
}
