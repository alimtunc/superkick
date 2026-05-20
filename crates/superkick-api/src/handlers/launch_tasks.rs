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
    AgentCatalog, LaunchTask, LaunchTaskId, LaunchTaskIntervention, LaunchTaskStatus,
    LaunchTaskStep, LaunchTaskStepId, PlanImplementReviewAgents, RunId,
};
use superkick_runtime::launch_task::RealStepRunner;
use superkick_runtime::{LaunchTaskEvent, LaunchTaskEventBus, LaunchTaskExecutor, StepRunner};
use superkick_storage::repo::{LaunchTaskInterventionRepo, LaunchTaskRepo};
use superkick_storage::{
    SqliteAgentSessionRepo, SqliteLaunchTaskInterventionRepo, SqliteLaunchTaskRepo, SqliteRunRepo,
    SqliteRunStepRepo, SqliteTranscriptRepo,
};

use crate::error::AppError;
use crate::{AppState, EventRepo};

const TASK_NOT_FOUND: &str = "launch task not found";

/// Production wiring of the executor. SUP-124 swapped the V1 `StubStepRunner`
/// for `RealStepRunner`, which spawns a real agent process per step. Held as
/// a concrete type alias so the handlers can name it without dragging the
/// generic parameters across the HTTP layer. SUP-154 added the intervention
/// repo as the 7th generic so the runner can inject operator interventions
/// at step start.
pub type ProdRealStepRunner = RealStepRunner<
    SqliteRunRepo,
    SqliteRunStepRepo,
    EventRepo,
    SqliteAgentSessionRepo,
    SqliteTranscriptRepo,
    SqliteLaunchTaskRepo,
    SqliteLaunchTaskInterventionRepo,
>;
pub type ProdLaunchTaskExecutor = LaunchTaskExecutor<SqliteLaunchTaskRepo, ProdRealStepRunner>;

/// Substate slice the launch-task handlers need: the SQLite repo, the project
/// agent catalog (for validating agent names at create time), and the SUP-118
/// execution plane (event bus, registry, executor). Generic over the
/// `StepRunner` so the test router (`launch_task_test_router`) can wire a
/// deterministic stub while production runs the real agent spawn loop.
pub struct LaunchTaskState<S: StepRunner> {
    pub repo: Arc<SqliteLaunchTaskRepo>,
    pub intervention_repo: Arc<SqliteLaunchTaskInterventionRepo>,
    pub catalog: Arc<AgentCatalog>,
    pub bus: Arc<LaunchTaskEventBus>,
    pub executor: Arc<LaunchTaskExecutor<SqliteLaunchTaskRepo, S>>,
    /// Whether `create_launch_task` should auto-spawn the executor in the
    /// background. Always `true` in production wiring; the test router opts
    /// out so that SUP-116 status assertions (e.g. "freshly created tasks
    /// are Pending") stay deterministic. The executor itself is exhaustively
    /// covered at the runtime layer in
    /// `superkick-runtime/tests/launch_task_executor.rs`.
    pub auto_trigger_executor: bool,
}

// Manual `Clone` so the derive doesn't infect `S` with a `Clone` bound — the
// fields are all `Arc`/`Copy`, so cloning the wrapper is unconditional.
impl<S: StepRunner> Clone for LaunchTaskState<S> {
    fn clone(&self) -> Self {
        Self {
            repo: Arc::clone(&self.repo),
            intervention_repo: Arc::clone(&self.intervention_repo),
            catalog: Arc::clone(&self.catalog),
            bus: Arc::clone(&self.bus),
            executor: Arc::clone(&self.executor),
            auto_trigger_executor: self.auto_trigger_executor,
        }
    }
}

impl FromRef<AppState> for LaunchTaskState<ProdRealStepRunner> {
    fn from_ref(state: &AppState) -> Self {
        Self {
            repo: Arc::clone(&state.launch_task_repo),
            intervention_repo: Arc::clone(&state.launch_task_intervention_repo),
            catalog: Arc::clone(&state.agent_catalog),
            bus: Arc::clone(&state.launch_task_event_bus),
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

pub async fn create_launch_task<S: StepRunner>(
    State(state): State<LaunchTaskState<S>>,
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

pub async fn list_launch_tasks<S: StepRunner>(
    State(state): State<LaunchTaskState<S>>,
    Query(q): Query<ListLaunchTasksQuery>,
) -> Result<Json<Vec<LaunchTask>>, AppError> {
    let tasks = state
        .repo
        .list(q.status, q.linear_issue_id.as_deref())
        .await?;
    Ok(Json(tasks))
}

pub async fn get_launch_task<S: StepRunner>(
    State(state): State<LaunchTaskState<S>>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<LaunchTask>, AppError> {
    let task = state
        .repo
        .get(LaunchTaskId(id))
        .await?
        .ok_or(AppError::NotFound(TASK_NOT_FOUND))?;
    Ok(Json(task))
}

/// SUP-154 — read every intervention attached to a task.
pub async fn list_launch_task_interventions<S: StepRunner>(
    State(state): State<LaunchTaskState<S>>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<Vec<LaunchTaskIntervention>>, AppError> {
    let task_id = LaunchTaskId(id);
    if state.repo.get(task_id).await?.is_none() {
        return Err(AppError::NotFound(TASK_NOT_FOUND));
    }
    let rows = state.intervention_repo.list_by_task(task_id).await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
pub struct CreateInterventionRequest {
    pub body: String,
    #[serde(default)]
    pub target_step_id: Option<uuid::Uuid>,
    #[serde(default)]
    pub author: Option<String>,
}

/// SUP-154 — POST a free-text intervention against a running Launch Task.
/// Persisted immediately and published on the SSE bus; injected into the
/// next step's prompt by the runtime. Does not interrupt the active step.
pub async fn create_launch_task_intervention<S: StepRunner>(
    State(state): State<LaunchTaskState<S>>,
    Path(id): Path<uuid::Uuid>,
    Json(body): Json<CreateInterventionRequest>,
) -> Result<impl IntoResponse, AppError> {
    let task_id = LaunchTaskId(id);
    let task = state
        .repo
        .get(task_id)
        .await?
        .ok_or(AppError::NotFound(TASK_NOT_FOUND))?;

    let intervention = LaunchTaskIntervention::new(
        task_id,
        body.target_step_id.map(LaunchTaskStepId),
        body.author,
        body.body,
    )?;
    state.intervention_repo.insert(&intervention).await?;

    state.bus.publish(LaunchTaskEvent::InterventionAdded {
        task_id: task.id,
        linear_issue_id: task.linear_issue_id.clone(),
        intervention_id: intervention.id,
        target_step_id: intervention.target_step_id,
        body: intervention.body.clone(),
        created_at: intervention.created_at,
    });

    Ok((StatusCode::CREATED, Json(intervention)))
}

pub async fn list_launch_task_steps<S: StepRunner>(
    State(state): State<LaunchTaskState<S>>,
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

pub async fn cancel_launch_task<S: StepRunner>(
    State(state): State<LaunchTaskState<S>>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<CancelLaunchTaskResponse>, AppError> {
    let task_id = LaunchTaskId(id);
    let outcome = state
        .executor
        .cancel(task_id)
        .await?
        .ok_or(AppError::NotFound(TASK_NOT_FOUND))?;
    Ok(Json(CancelLaunchTaskResponse {
        task_id,
        status: outcome.status,
        signalled: outcome.signalled,
    }))
}

#[derive(Serialize)]
pub struct RetryLaunchTaskResponse {
    pub task_id: LaunchTaskId,
    pub status: LaunchTaskStatus,
    pub step_id: LaunchTaskStepId,
    /// New run id linked to the retried step by the runner. SUP-124's
    /// `RealStepRunner` populates this with the shadow run id; tests using
    /// `StubStepRunner` leave it `None`.
    pub new_linked_run_id: Option<RunId>,
}

/// Retry the step that put a launch task into `NeedsHuman`. Validates the
/// task is in `NeedsHuman` and that its `current_step_id` is itself in
/// `NeedsHuman`; both checks raise `CoreError::InvalidLaunchTask*Transition`,
/// which the shared mapping in `error.rs` renders as 409.
///
/// On success the retried step is re-run via the same runner the cold-start
/// loop uses, producing a new run id (and overwriting the step's
/// `linked_run_id`; the previous run remains queryable via `linear_issue_id`
/// — see SUP-120 plan, "append-only des liens").
pub async fn retry_launch_task<S: StepRunner>(
    State(state): State<LaunchTaskState<S>>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<RetryLaunchTaskResponse>, AppError> {
    let task_id = LaunchTaskId(id);
    let outcome = state.executor.retry_needs_human_step(task_id).await?;
    Ok(Json(RetryLaunchTaskResponse {
        task_id,
        status: outcome.task_status,
        step_id: outcome.retried_step_id,
        new_linked_run_id: outcome.new_linked_run_id,
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

pub async fn launch_task_events_sse<S: StepRunner>(
    State(state): State<LaunchTaskState<S>>,
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
