//! SUP-116 + SUP-118: launch task HTTP handlers.
//!
//! Read/create handlers stay thin — translate JSON to/from
//! `superkick_core::LaunchTask` and delegate persistence + validation. The
//! domain validates agent names against the project `AgentCatalog`; the
//! handler only forwards the catalog from app state.
//!
//! SUP-118 adds the execution control plane: `create` auto-spawns the
//! executor, `cancel` signals the registry, and `/launch-tasks/events` fans
//! the in-process broadcast bus out as Server-Sent Events. None of these
//! own business logic — they delegate to `LaunchTaskExecutor` and friends.

use std::sync::Arc;

use axum::extract::{FromRef, Path, Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Json};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast::error::RecvError;

use superkick_core::{
    AgentCatalog, LaunchTask, LaunchTaskId, LaunchTaskStatus, LaunchTaskStep,
    PlanImplementReviewAgents,
};
use superkick_runtime::{
    LaunchTaskEventBus, LaunchTaskExecutor, LaunchTaskRegistry, StubStepRunner,
};
use superkick_storage::SqliteLaunchTaskRepo;
use superkick_storage::repo::LaunchTaskRepo;

use crate::AppState;
use crate::error::AppError;

const TASK_NOT_FOUND: &str = "launch task not found";

/// Production wiring of the executor. Held as a concrete type alias so the
/// handlers can name it without dragging the generic parameters across the
/// HTTP layer.
pub type ProdLaunchTaskExecutor = LaunchTaskExecutor<SqliteLaunchTaskRepo, StubStepRunner>;

/// Substate slice the launch-task handlers need: the SQLite repo, the project
/// agent catalog (for validating agent names at create time), and the SUP-118
/// execution plane (event bus, registry, executor). The `FromRef` impl pulls
/// everything out of `AppState`; the test router builds them directly with
/// in-memory defaults so integration tests don't have to materialise a full
/// `AppState`.
#[derive(Clone)]
pub struct LaunchTaskState {
    pub repo: Arc<SqliteLaunchTaskRepo>,
    pub catalog: Arc<AgentCatalog>,
    pub bus: Arc<LaunchTaskEventBus>,
    pub registry: Arc<LaunchTaskRegistry>,
    pub executor: Arc<ProdLaunchTaskExecutor>,
    /// Whether `create_launch_task` should auto-spawn the executor in the
    /// background. Always `true` in production wiring; the test router opts
    /// out so that SUP-116 status assertions (e.g. "freshly created tasks
    /// are Pending") stay deterministic. The executor itself is exhaustively
    /// covered at the runtime layer in
    /// `superkick-runtime/tests/launch_task_executor.rs`.
    pub auto_trigger_executor: bool,
}

impl FromRef<AppState> for LaunchTaskState {
    fn from_ref(state: &AppState) -> Self {
        Self {
            repo: Arc::clone(&state.launch_task_repo),
            catalog: Arc::clone(&state.agent_catalog),
            bus: Arc::clone(&state.launch_task_event_bus),
            registry: Arc::clone(&state.launch_task_registry),
            executor: Arc::clone(&state.launch_task_executor),
            auto_trigger_executor: true,
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

    // SUP-118: trigger the executor in the background. A crash before the
    // task reaches a terminal state leaves it `Pending`; recovery is hors
    // scope V1 (see `LaunchTaskRegistry` docstring). Tests opt out via
    // `auto_trigger_executor` so SUP-116 status pinning stays deterministic.
    // The detached `JoinHandle` is dropped — V1 has no shutdown drain; the
    // signature exists so a future supervisor can swap in.
    if state.auto_trigger_executor {
        Arc::clone(&state.executor).spawn(task.id);
    }

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

#[derive(Serialize)]
pub struct CancelLaunchTaskResponse {
    pub task_id: LaunchTaskId,
    pub status: LaunchTaskStatus,
    /// `true` when a live executor was found in this process and signalled.
    /// `false` when the task is terminal or already orphaned (DB row updated
    /// directly in the latter case).
    pub signalled: bool,
}

/// Cancel a launch task. Behaviour:
///
/// * Live executor in this process → signal via the registry. The executor
///   transitions the in-flight step to `Cancelled` and the task to
///   `Cancelled` on the next step boundary. Returns `signalled: true` with
///   the row's current (pre-cancel) status as a hint; SSE / polling pick up
///   the terminal state.
/// * No live executor (already terminal, orphan after restart, or task
///   never auto-started) → delegate to
///   `LaunchTaskExecutor::cancel_orphan`, which re-reads the row, leaves
///   already-terminal tasks alone, and otherwise persists `Cancelled` and
///   publishes the matching `TaskStatusChanged` event through the same
///   code path the in-process loop uses (so SSE stays in sync with the
///   DB). Returns `signalled: false` with the row's actual current status.
///
/// The registry probe runs before any DB read, which avoids a race where
/// the executor finalises and unregisters between the read and the cancel
/// signal.
pub async fn cancel_launch_task(
    State(state): State<LaunchTaskState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<CancelLaunchTaskResponse>, AppError> {
    let task_id = LaunchTaskId(id);

    if state.registry.cancel(task_id) {
        let task = state
            .repo
            .get(task_id)
            .await?
            .ok_or(AppError::NotFound(TASK_NOT_FOUND))?;
        return Ok(Json(CancelLaunchTaskResponse {
            task_id,
            status: task.status,
            signalled: true,
        }));
    }

    let status = state
        .executor
        .cancel_orphan(task_id)
        .await?
        .ok_or(AppError::NotFound(TASK_NOT_FOUND))?;
    Ok(Json(CancelLaunchTaskResponse {
        task_id,
        status,
        signalled: false,
    }))
}

#[derive(Deserialize)]
pub struct LaunchTaskEventsQuery {
    /// Optional Linear-issue filter. When set, only events whose
    /// `linear_issue_id` matches are forwarded — every other transition is
    /// silently dropped from this subscriber's stream. Persistence remains
    /// authoritative on `Lagged`.
    #[serde(default)]
    pub linear_issue_id: Option<String>,
}

pub async fn launch_task_events_sse(
    State(state): State<LaunchTaskState>,
    Query(q): Query<LaunchTaskEventsQuery>,
) -> Result<impl IntoResponse, AppError> {
    let mut rx = state.bus.subscribe();
    let filter = q.linear_issue_id;

    let stream = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(event) => {
                    if let Some(filter) = filter.as_deref()
                        && event.linear_issue_id() != filter
                    {
                        continue;
                    }
                    let data = match serde_json::to_string(&event) {
                        Ok(d) => d,
                        Err(e) => {
                            yield Ok::<Event, std::convert::Infallible>(
                                Event::default().event("error").data(e.to_string())
                            );
                            continue;
                        }
                    };
                    yield Ok(Event::default().event("launch_task_event").data(data));
                }
                Err(RecvError::Lagged(skipped)) => {
                    yield Ok(
                        Event::default()
                            .event("lagged")
                            .data(skipped.to_string()),
                    );
                }
                Err(RecvError::Closed) => {
                    yield Ok(Event::default().event("done").data("bus closed"));
                    break;
                }
            }
        }
    };

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}
