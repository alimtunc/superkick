//! SUP-187 — read surface for the derived `RunContextSnapshot`.
//!
//! `GET /launch-tasks/{id}/snapshot` delegates to
//! [`refresh_run_context_snapshot`]: derive a redacted projection from canonical
//! state, refresh the regenerable cache row, and return it. Read-only over
//! business state — no task/step/run transition.

use std::sync::Arc;

use axum::extract::{FromRef, Path, State};
use axum::response::Json;

use superkick_core::{LaunchTaskId, RunContextSnapshot};
use superkick_runtime::refresh_run_context_snapshot;
use superkick_storage::{
    SqliteAgentSessionRepo, SqliteIssueWorkspaceContextRepo, SqliteLaunchTaskRepo,
    SqliteRunContextSnapshotRepo, SqliteRunRepo,
};

use crate::error::AppError;
use crate::{AppState, EventRepo};

/// Substate the snapshot handler needs: the read repos the builder derives from
/// plus the snapshot repo it persists the result to.
#[derive(Clone)]
pub struct SnapshotState {
    pub launch_task_repo: Arc<SqliteLaunchTaskRepo>,
    pub run_repo: Arc<SqliteRunRepo>,
    pub session_repo: Arc<SqliteAgentSessionRepo>,
    pub event_repo: Arc<EventRepo>,
    pub issue_workspace_context_repo: Arc<SqliteIssueWorkspaceContextRepo>,
    pub snapshot_repo: Arc<SqliteRunContextSnapshotRepo>,
}

impl FromRef<AppState> for SnapshotState {
    fn from_ref(state: &AppState) -> Self {
        Self {
            launch_task_repo: Arc::clone(&state.launch_task_repo),
            run_repo: Arc::clone(&state.run_repo),
            session_repo: Arc::clone(&state.session_repo),
            event_repo: Arc::clone(&state.event_repo),
            issue_workspace_context_repo: Arc::clone(&state.issue_workspace_context_repo),
            snapshot_repo: Arc::clone(&state.run_context_snapshot_repo),
        }
    }
}

/// Derive → redact → persist → return the current snapshot for a launch task.
/// 404 when the task does not exist (via [`AppError`] from the builder).
pub async fn get_launch_task_snapshot(
    State(state): State<SnapshotState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<RunContextSnapshot>, AppError> {
    let snapshot = refresh_run_context_snapshot(
        state.launch_task_repo.as_ref(),
        state.run_repo.as_ref(),
        state.session_repo.as_ref(),
        state.event_repo.as_ref(),
        state.issue_workspace_context_repo.as_ref(),
        state.snapshot_repo.as_ref(),
        LaunchTaskId(id),
        chrono::Utc::now(),
    )
    .await?;
    Ok(Json(snapshot))
}
