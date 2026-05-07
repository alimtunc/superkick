//! SUP-116: launch task HTTP handlers.
//!
//! No business logic here — handlers translate JSON to/from
//! `superkick_core::LaunchTask` and delegate persistence + validation. The
//! domain validates agent names against the project `AgentCatalog`; the
//! handler only forwards the catalog from app state.

use std::sync::Arc;

use axum::extract::{FromRef, Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::{Deserialize, Serialize};

use superkick_core::{
    AgentCatalog, LaunchTask, LaunchTaskId, LaunchTaskStatus, LaunchTaskStep,
    PlanImplementReviewAgents,
};
use superkick_storage::SqliteLaunchTaskRepo;
use superkick_storage::repo::LaunchTaskRepo;

use crate::AppState;
use crate::error::AppError;

const TASK_NOT_FOUND: &str = "launch task not found";

/// Substate slice the launch-task handlers need: the SQLite repo and the
/// project agent catalog (for validating agent names at create time). The
/// `FromRef` impl pulls both out of `AppState`; the test router builds them
/// directly so integration tests don't have to rebuild `AppState`.
#[derive(Clone)]
pub struct LaunchTaskState {
    pub repo: Arc<SqliteLaunchTaskRepo>,
    pub catalog: Arc<AgentCatalog>,
}

impl FromRef<AppState> for LaunchTaskState {
    fn from_ref(state: &AppState) -> Self {
        Self {
            repo: Arc::clone(&state.launch_task_repo),
            catalog: Arc::clone(&state.agent_catalog),
        }
    }
}

#[derive(Deserialize)]
pub struct CreateLaunchTaskRequest {
    pub linear_issue_id: String,
    pub planner_agent: String,
    pub coder_agent: String,
    pub reviewer_agent: String,
}

#[derive(Serialize)]
pub struct LaunchTaskWithSteps {
    pub task: LaunchTask,
    pub steps: Vec<LaunchTaskStep>,
}

pub async fn create_launch_task(
    State(state): State<LaunchTaskState>,
    Json(body): Json<CreateLaunchTaskRequest>,
) -> Result<impl IntoResponse, AppError> {
    let agents = PlanImplementReviewAgents {
        planner: body.planner_agent.trim().to_string(),
        coder: body.coder_agent.trim().to_string(),
        reviewer: body.reviewer_agent.trim().to_string(),
    };
    let (task, steps) = LaunchTask::new_with_v1_recipe(
        body.linear_issue_id.trim().to_string(),
        agents,
        state.catalog.as_ref(),
    )?;
    state.repo.insert_with_steps(&task, &steps).await?;
    Ok((
        StatusCode::CREATED,
        Json(LaunchTaskWithSteps { task, steps }),
    ))
}

#[derive(Deserialize)]
pub struct ListLaunchTasksQuery {
    #[serde(default)]
    pub linear_issue_id: Option<String>,
    #[serde(default)]
    pub status: Option<LaunchTaskStatus>,
}

pub async fn list_launch_tasks(
    State(state): State<LaunchTaskState>,
    Query(q): Query<ListLaunchTasksQuery>,
) -> Result<Json<Vec<LaunchTask>>, AppError> {
    let tasks = state
        .repo
        .list(q.status, q.linear_issue_id.as_deref())
        .await?;
    Ok(Json(tasks))
}

pub async fn get_launch_task(
    State(state): State<LaunchTaskState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<LaunchTask>, AppError> {
    let task = state
        .repo
        .get(LaunchTaskId(id))
        .await?
        .ok_or(AppError::NotFound(TASK_NOT_FOUND))?;
    Ok(Json(task))
}

pub async fn list_launch_task_steps(
    State(state): State<LaunchTaskState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<Vec<LaunchTaskStep>>, AppError> {
    let task_id = LaunchTaskId(id);
    if state.repo.get(task_id).await?.is_none() {
        return Err(AppError::NotFound(TASK_NOT_FOUND));
    }
    let steps = state.repo.list_steps(task_id).await?;
    Ok(Json(steps))
}
