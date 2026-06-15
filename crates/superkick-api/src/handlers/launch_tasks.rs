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
use axum::response::{IntoResponse, Json};
use serde::{Deserialize, Serialize};

use superkick_core::{
    AgentCatalog, LaunchTask, LaunchTaskId, LaunchTaskIntervention, LaunchTaskOverrides,
    LaunchTaskStatus, LaunchTaskStep, LaunchTaskStepId, PlanImplementReviewAgents, ProfileStep,
    RetryPath, ReuseWorktree, RunId,
};
use superkick_integrations::linear::{IssueUpdateInput, LinearClient};
use superkick_runtime::launch_task::RealStepRunner;
use superkick_runtime::{
    LaunchTaskEvent, LaunchTaskEventBus, LaunchTaskExecutor, StepRunner,
    refresh_run_context_snapshot,
};
use superkick_storage::repo::{LaunchTaskInterventionRepo, LaunchTaskRepo};
use superkick_storage::{
    SqliteAgentSessionRepo, SqliteIssueWorkspaceContextRepo, SqliteLaunchTaskInterventionRepo,
    SqliteLaunchTaskRepo, SqliteRunContextSnapshotRepo, SqliteRunRepo, SqliteRunStepRepo,
    SqliteSkillDefinitionRepo, SqliteTranscriptRepo,
};

use crate::error::AppError;
use crate::{AppState, EventRepo};

const TASK_NOT_FOUND: &str = "launch task not found";

/// Require a non-empty agent name for the legacy v1-recipe path.
fn require_agent(value: Option<&str>, field: &str) -> Result<String, AppError> {
    value
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| {
            AppError::BadRequest(format!("{field} is required when profile_id is absent"))
        })
}

/// Worktree reuse is opt-in and atomic: a path with no branch (or vice versa)
/// is a malformed request, not a partial reuse.
fn reuse_worktree_override(
    path: Option<String>,
    branch: Option<String>,
) -> Result<Option<ReuseWorktree>, AppError> {
    match (path, branch) {
        (Some(path), Some(branch)) => Ok(Some(ReuseWorktree { path, branch })),
        (None, None) => Ok(None),
        _ => Err(AppError::BadRequest(
            "reuse_worktree_path and reuse_worktree_branch must be provided together".into(),
        )),
    }
}

/// Production wiring of the executor: spawns a real agent process per step.
/// Held as a concrete type alias so the handlers can name it without dragging
/// the generic parameters across the HTTP layer.
pub type ProdRealStepRunner = RealStepRunner<
    SqliteRunRepo,
    SqliteRunStepRepo,
    EventRepo,
    SqliteAgentSessionRepo,
    SqliteTranscriptRepo,
    SqliteLaunchTaskRepo,
    SqliteLaunchTaskInterventionRepo,
    SqliteSkillDefinitionRepo,
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
    /// Part of the retry snapshot read set (see `session_repo`).
    pub run_repo: Arc<SqliteRunRepo>,
    /// SUP-203 — read repos the snapshot builder derives from (with `run_repo`),
    /// plus the regenerable snapshot cache, so an operator retry can refresh the
    /// derived `RunContextSnapshot` before re-running the parked step. Reads
    /// only; the snapshot stays derived (no FK, replaced wholesale).
    pub session_repo: Arc<SqliteAgentSessionRepo>,
    pub event_repo: Arc<EventRepo>,
    pub issue_workspace_context_repo: Arc<SqliteIssueWorkspaceContextRepo>,
    pub snapshot_repo: Arc<SqliteRunContextSnapshotRepo>,
    pub catalog: Arc<AgentCatalog>,
    pub bus: Arc<LaunchTaskEventBus>,
    pub executor: Arc<LaunchTaskExecutor<SqliteLaunchTaskRepo, S>>,
    /// Composes dynamic launches from a profile + step overrides.
    /// `None` in the test router (which exercises only the legacy triplet path).
    pub launch_profile_service: Option<Arc<crate::ProdLaunchProfileService>>,
    /// Whether `create_launch_task` auto-spawns the executor. Always `true`
    /// in production; the test router opts out so create-time status
    /// assertions stay deterministic.
    pub auto_trigger_executor: bool,
    /// Linear client used to move the issue to "In Progress" on launch.
    /// `None` when the integration is unconfigured (or in the test router).
    pub linear_client: Option<Arc<LinearClient>>,
    /// `launch_profile.auto_transition_in_progress` snapshot — gates the
    /// on-launch Linear workflow-state move.
    pub auto_transition_in_progress: bool,
}

// Manual `Clone` so the derive doesn't infect `S` with a `Clone` bound — the
// fields are all `Arc`/`Copy`, so cloning the wrapper is unconditional.
impl<S: StepRunner> Clone for LaunchTaskState<S> {
    fn clone(&self) -> Self {
        Self {
            repo: Arc::clone(&self.repo),
            intervention_repo: Arc::clone(&self.intervention_repo),
            run_repo: Arc::clone(&self.run_repo),
            session_repo: Arc::clone(&self.session_repo),
            event_repo: Arc::clone(&self.event_repo),
            issue_workspace_context_repo: Arc::clone(&self.issue_workspace_context_repo),
            snapshot_repo: Arc::clone(&self.snapshot_repo),
            catalog: Arc::clone(&self.catalog),
            bus: Arc::clone(&self.bus),
            executor: Arc::clone(&self.executor),
            launch_profile_service: self.launch_profile_service.clone(),
            auto_trigger_executor: self.auto_trigger_executor,
            linear_client: self.linear_client.clone(),
            auto_transition_in_progress: self.auto_transition_in_progress,
        }
    }
}

impl FromRef<AppState> for LaunchTaskState<ProdRealStepRunner> {
    fn from_ref(state: &AppState) -> Self {
        Self {
            repo: Arc::clone(&state.launch_task_repo),
            intervention_repo: Arc::clone(&state.launch_task_intervention_repo),
            run_repo: Arc::clone(&state.run_repo),
            session_repo: Arc::clone(&state.session_repo),
            event_repo: Arc::clone(&state.event_repo),
            issue_workspace_context_repo: Arc::clone(&state.issue_workspace_context_repo),
            snapshot_repo: Arc::clone(&state.run_context_snapshot_repo),
            catalog: state.agent_catalog.snapshot(),
            bus: Arc::clone(&state.launch_task_event_bus),
            executor: Arc::clone(&state.launch_task_executor),
            launch_profile_service: Some(Arc::clone(&state.launch_profile_service)),
            auto_trigger_executor: true,
            linear_client: state.linear_client.clone(),
            auto_transition_in_progress: state.launch_profile.auto_transition_in_progress,
        }
    }
}

#[derive(Deserialize)]
pub struct CreateLaunchTaskRequest {
    pub linear_issue_id: String,
    /// Dynamic path: launch from an app-managed profile, optionally with
    /// composer step edits. When set, the legacy agent triplet is ignored.
    #[serde(default)]
    pub profile_id: Option<String>,
    #[serde(default)]
    pub step_overrides: Option<Vec<ProfileStep>>,
    /// Legacy v1-recipe path. Required only when `profile_id` is absent.
    #[serde(default)]
    pub planner_agent: Option<String>,
    #[serde(default)]
    pub coder_agent: Option<String>,
    #[serde(default)]
    pub reviewer_agent: Option<String>,
    #[serde(default)]
    pub base_branch: Option<String>,
    #[serde(default)]
    pub use_worktree: Option<bool>,
    /// Reuse an issue's surviving finished worktree. Both fields are
    /// supplied together (detected via `GET /issues/{id}/reusable-worktree`)
    /// or both omitted.
    #[serde(default)]
    pub reuse_worktree_path: Option<String>,
    #[serde(default)]
    pub reuse_worktree_branch: Option<String>,
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
    let linear_issue_id = body.linear_issue_id.trim().to_string();
    // No active-run hard block: the operator may launch a second run on an issue
    // already in flight (UI shows a non-blocking advisory; runs are run-id-scoped).

    let reuse_worktree =
        reuse_worktree_override(body.reuse_worktree_path, body.reuse_worktree_branch)?;

    let (task, steps) = if let Some(profile_id) = body.profile_id.as_deref() {
        // Dynamic path — compose from the chosen profile + overrides.
        let service = state
            .launch_profile_service
            .as_ref()
            .ok_or(AppError::ServiceUnavailable(
                "launch profile composer unavailable",
            ))?;
        service
            .compose_launch_task(
                &linear_issue_id,
                profile_id,
                body.step_overrides,
                LaunchTaskOverrides {
                    base_branch: body.base_branch,
                    use_worktree: body.use_worktree,
                    reuse_worktree,
                },
            )
            .await?
    } else {
        // Legacy v1-recipe path — requires the agent triplet.
        let agents = PlanImplementReviewAgents {
            planner: require_agent(body.planner_agent.as_deref(), "planner_agent")?,
            coder: require_agent(body.coder_agent.as_deref(), "coder_agent")?,
            reviewer: require_agent(body.reviewer_agent.as_deref(), "reviewer_agent")?,
        };
        let (mut task, steps) = LaunchTask::new_with_v1_recipe(
            linear_issue_id.clone(),
            agents,
            state.catalog.as_ref(),
        )?;
        task.apply_overrides(LaunchTaskOverrides {
            base_branch: body.base_branch,
            use_worktree: body.use_worktree,
            reuse_worktree,
        })?;
        state.repo.insert_with_steps(&task, &steps).await?;
        (task, steps)
    };

    // A crash before the task reaches a terminal state leaves it `Pending`;
    // the liveness sweep reconciles. Tests opt out for deterministic status.
    if state.auto_trigger_executor {
        Arc::clone(&state.executor).spawn(task.id);
    }

    // Best-effort: move the Linear issue to "In Progress" on launch. Never
    // fails the create — a transition error only logs.
    if state.auto_transition_in_progress {
        if let Some(client) = state.linear_client.as_ref() {
            maybe_transition_to_started(client, &linear_issue_id).await;
        }
    }

    Ok((
        StatusCode::CREATED,
        Json(LaunchTaskWithSteps { task, steps }),
    ))
}

/// State types that mean "do not move backward": the issue is already underway
/// or finished, so a launch must not drag it back to In Progress.
const ALREADY_PROGRESSED_STATE_TYPES: &[&str] = &["started", "completed"];

/// Move the Linear issue identified by `issue_ref` (identifier like `SUP-122`
/// or a UUID) to its team's first "started"-type workflow state. Skips issues
/// already in a started/completed state. Best-effort — every failure path logs
/// and returns without propagating, so the launch is never blocked.
async fn maybe_transition_to_started(client: &LinearClient, issue_ref: &str) {
    let detail = match client.get_issue(issue_ref).await {
        Ok(detail) => detail,
        Err(err) => {
            tracing::warn!(issue = issue_ref, error = %err, "auto-transition: issue lookup failed");
            return;
        }
    };

    if ALREADY_PROGRESSED_STATE_TYPES.contains(&detail.status.state_type.as_str()) {
        return;
    }

    let state_id = match client
        .resolve_workflow_state_for_type(detail.team_id.as_deref(), "started", Some(&detail.id))
        .await
    {
        Ok(id) => id,
        Err(err) => {
            tracing::warn!(
                issue = issue_ref,
                error = %err,
                "auto-transition: no started-type workflow state resolved"
            );
            return;
        }
    };

    if let Err(err) = client
        .update_issue(
            &detail.id,
            IssueUpdateInput {
                state_id: Some(state_id),
                ..Default::default()
            },
        )
        .await
    {
        tracing::warn!(issue = issue_ref, error = %err, "auto-transition: update_issue failed");
    }
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

/// SUP-203 — selects how the retry re-enters the runner. `fix_forward` (the
/// default) keeps the persisted provider thread (`resume_turn`); `fresh` starts
/// a new turn. An absent `path` query resolves to `fix_forward`, so existing
/// no-argument retry callers keep their behaviour.
#[derive(Debug, Default, Deserialize)]
pub struct RetryLaunchTaskQuery {
    #[serde(default)]
    pub path: RetryPath,
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
///
/// SUP-203 — before re-running, the derived `RunContextSnapshot` is regenerated
/// so the snapshot cache (read by takeover + the snapshot endpoint) reflects the
/// pre-retry context. The refresh is best-effort and reads only; the snapshot
/// stays derived (no FK, replaced wholesale), never canonical.
pub async fn retry_launch_task<S: StepRunner>(
    State(state): State<LaunchTaskState<S>>,
    Path(id): Path<uuid::Uuid>,
    Query(query): Query<RetryLaunchTaskQuery>,
) -> Result<Json<RetryLaunchTaskResponse>, AppError> {
    let task_id = LaunchTaskId(id);
    if let Err(error) = refresh_run_context_snapshot(
        state.repo.as_ref(),
        state.run_repo.as_ref(),
        state.session_repo.as_ref(),
        state.event_repo.as_ref(),
        state.issue_workspace_context_repo.as_ref(),
        state.snapshot_repo.as_ref(),
        task_id,
        chrono::Utc::now(),
    )
    .await
    {
        tracing::warn!(%task_id, error = %error, "retry: snapshot refresh failed; retrying without refreshed context");
    }
    let outcome = state
        .executor
        .retry_needs_human_step(task_id, query.path)
        .await?;
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
    let rx = state.bus.subscribe();
    let filter = q.linear_issue_id;
    Ok(super::broadcast_sse(
        rx,
        "launch_task_event",
        move |event| {
            filter
                .as_deref()
                .is_none_or(|filter| event.linear_issue_id() == filter)
        },
    ))
}
