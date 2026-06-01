use std::sync::Arc;
use std::time::Duration;

use axum::extract::{FromRef, Path, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Json};
use serde::{Deserialize, Serialize};

use superkick_core::{
    AgentSession, AttentionRequest, ExecutionMode, Interrupt, PullRequest, Run, RunAgentOverrides,
    RunDiff, RunEvent, RunId, RunStep, SessionOwnership, TriggerSource,
};
use superkick_runtime::{DiffError, collect_run_diff};
use superkick_storage::SqliteRunRepo;
use superkick_storage::repo::{
    AgentSessionRepo, AttentionRequestRepo, InterruptRepo, RunEventRepo, RunRepo, RunStepRepo,
};

use crate::AppState;
use crate::error::AppError;

#[derive(Deserialize)]
pub struct CreateRunRequest {
    pub repo_slug: String,
    pub issue_id: String,
    pub issue_identifier: String,
    #[serde(default = "default_base_branch")]
    pub base_branch: String,
    /// Per-run worktree override. If absent, falls back to the launch profile default.
    pub use_worktree: Option<bool>,
    /// Execution mode override. Defaults to `full_auto`.
    #[serde(default)]
    pub execution_mode: ExecutionMode,
    pub operator_instructions: Option<String>,
    /// Per-step agent overrides. Each absent field falls back to the workflow
    /// default for that step. Names are validated against the agent catalog.
    #[serde(default)]
    pub planner_agent: Option<String>,
    #[serde(default)]
    pub coder_agent: Option<String>,
    #[serde(default)]
    pub reviewer_agent: Option<String>,
}

fn default_base_branch() -> String {
    "main".into()
}

/// Reject a launch when the issue already has an active (non-terminal) run.
/// Shared by `create_run` and the launch-task creation path so both entry
/// points surface the same 409 `DuplicateActiveRun` shape instead of letting
/// the `runs` partial-unique index blow up later as an opaque insert error.
pub(crate) async fn guard_no_active_run(
    run_repo: &SqliteRunRepo,
    issue_identifier: &str,
) -> Result<(), AppError> {
    let existing = run_repo
        .find_active_by_issue_identifier(issue_identifier)
        .await?;
    Run::guard_no_active(existing.as_ref(), issue_identifier)?;
    Ok(())
}

pub async fn create_run(
    State(state): State<AppState>,
    Json(body): Json<CreateRunRequest>,
) -> Result<impl IntoResponse, AppError> {
    let run = spawn_run_from_request(&state, body).await?;
    Ok((StatusCode::CREATED, Json(run)))
}

/// Shared spawn path used by `create_run` (raw API) and SUP-80's
/// `dispatch_from_queue`. Validates, guards against duplicates, inserts the
/// run, then kicks off execution. Extracted so the launch-queue dispatch
/// endpoint does not reimplement (and drift from) the guard/race-resolution
/// semantics already proven by `create_run`.
pub(crate) async fn spawn_run_from_request(
    state: &AppState,
    body: CreateRunRequest,
) -> Result<Run, AppError> {
    let repo_slug = body.repo_slug.trim().to_string();
    let issue_id = body.issue_id.trim().to_string();
    let issue_identifier = body.issue_identifier.trim().to_string();
    let base_branch = body.base_branch.trim().to_string();

    if repo_slug.is_empty() {
        return Err(AppError::BadRequest("repo_slug must not be empty".into()));
    }
    if issue_id.is_empty() {
        return Err(AppError::BadRequest("issue_id must not be empty".into()));
    }
    if issue_identifier.is_empty() {
        return Err(AppError::BadRequest(
            "issue_identifier must not be empty".into(),
        ));
    }
    if !repo_slug.contains('/') || repo_slug.starts_with('/') || repo_slug.ends_with('/') {
        return Err(AppError::BadRequest(
            "repo_slug must be in owner/repo format".into(),
        ));
    }

    let operator_instructions = body
        .operator_instructions
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    guard_no_active_run(&state.run_repo, &issue_identifier).await?;

    let use_worktree = body
        .use_worktree
        .unwrap_or(state.launch_profile.use_worktree);

    // Validate each per-step agent override against the project catalog and
    // collect the trimmed, non-empty names. An unknown agent → 400.
    let validate_agent = |raw: Option<String>, label: &str| -> Result<Option<String>, AppError> {
        let Some(name) = raw.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) else {
            return Ok(None);
        };
        if state.agent_catalog.get(&name).is_none() {
            return Err(AppError::BadRequest(format!(
                "{label} agent '{name}' is not defined in the project catalog"
            )));
        }
        Ok(Some(name))
    };
    let agent_overrides = RunAgentOverrides {
        planner: validate_agent(body.planner_agent, "planner")?,
        coder: validate_agent(body.coder_agent, "coder")?,
        reviewer: validate_agent(body.reviewer_agent, "reviewer")?,
    };

    let run = Run::new(
        issue_id,
        issue_identifier,
        repo_slug,
        TriggerSource::Manual,
        body.execution_mode,
        base_branch,
        use_worktree,
        operator_instructions,
    )
    .with_budget(state.run_budget)
    .with_agent_overrides(agent_overrides);

    state
        .run_service
        .spawn_run(run)
        .await
        .map_err(AppError::from)
}

pub async fn list_runs(State(state): State<AppState>) -> Result<Json<Vec<Run>>, AppError> {
    let runs = state.run_repo.list_all().await?;
    Ok(Json(runs))
}

#[derive(Serialize)]
struct GetRunResponse {
    run: Run,
    steps: Vec<RunStep>,
    sessions: Vec<AgentSession>,
    interrupts: Vec<Interrupt>,
    attention_requests: Vec<AttentionRequest>,
    ownership: Vec<SessionOwnership>,
    pr: Option<PullRequest>,
}

pub async fn get_run(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);
    let run = state.run_repo.get(run_id).await?;
    let Some(run) = run else {
        return Err(AppError::NotFound("run not found"));
    };
    let steps = state.step_repo.list_by_run(run_id).await?;
    let sessions = state.session_repo.list_by_run(run_id).await?;
    let interrupts = state.interrupt_repo.list_by_run(run_id).await?;
    let attention_requests = state.attention_repo.list_by_run(run_id).await?;
    let pr = state.pr_service.resolve_pr(run_id, &run.repo_slug).await;

    let ownership = match state.ownership_service.snapshots_for_run(run_id).await {
        Ok(snaps) => snaps,
        Err(err) => {
            tracing::warn!(%run_id, error = %err, "failed to read run ownership snapshots");
            Vec::new()
        }
    };

    Ok(Json(GetRunResponse {
        run,
        steps,
        sessions,
        interrupts,
        attention_requests,
        ownership,
        pr,
    }))
}

/// JSON snapshot of persisted events for a run; the SSE bus at
/// `/runs/{id}/events` only delivers events published after the subscription.
pub async fn list_run_events(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<Vec<RunEvent>>, AppError> {
    let run_id = RunId(id);
    if state.run_repo.get(run_id).await?.is_none() {
        return Err(AppError::NotFound("run not found"));
    }
    let events = state.event_repo.list_by_run(run_id).await?;
    Ok(Json(events))
}

pub async fn get_run_events(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);

    let run = state.run_repo.get(run_id).await?;
    if run.is_none() {
        return Err(AppError::NotFound("run not found"));
    }

    let event_repo = Arc::clone(&state.event_repo);
    let run_repo = Arc::clone(&state.run_repo);

    let stream = async_stream::stream! {
        let mut offset: usize = 0;

        loop {
            let events = match event_repo.list_by_run_from_offset(run_id, offset).await {
                Ok(events) => events,
                Err(e) => {
                    yield Ok(Event::default().event("error").data(e.to_string()));
                    break;
                }
            };

            for event in &events {
                let data = match serde_json::to_string(event) {
                    Ok(d) => d,
                    Err(e) => {
                        yield Ok(Event::default().event("error").data(e.to_string()));
                        break;
                    }
                };
                yield Ok::<Event, std::convert::Infallible>(
                    Event::default().event("run_event").data(data)
                );
            }
            offset += events.len();

            if let Ok(Some(run)) = run_repo.get(run_id).await {
                if run.state.is_terminal() {
                    yield Ok(Event::default().event("done").data("run finished"));
                    break;
                }
            }

            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    };

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

pub async fn cancel_run(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);
    match state.run_service.cancel_run(run_id).await? {
        None => Err(AppError::NotFound("run not found")),
        Some(run) => Ok(Json(run)),
    }
}

/// SUP-172 — substate slice the run-diff handler reads. Carved out of
/// `AppState` via `FromRef` so the test router can stand the handler up
/// against just a `RunRepo` plus the workspace default branch, without
/// materialising the full app state.
#[derive(Clone)]
pub struct RunDiffState {
    pub run_repo: Arc<SqliteRunRepo>,
    pub base_branch: String,
}

impl FromRef<AppState> for RunDiffState {
    fn from_ref(state: &AppState) -> Self {
        Self {
            run_repo: Arc::clone(&state.run_repo),
            base_branch: state.base_branch.clone(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunDiffRun {
    id: String,
    use_worktree: bool,
    worktree_path: Option<String>,
    branch_name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RunDiffResponse {
    run: RunDiffRun,
    diff: RunDiff,
}

/// `GET /runs/{id}/diff` — read-only file diff for a run's worktree.
///
/// Status mapping:
/// - run not found → 404 `run not found`
/// - run does not use a worktree → 422 (V1 only supports worktree mode)
/// - run has no `worktree_path` yet, or the directory was cleaned up → 404 `worktree`
/// - any other git failure → 500
pub async fn get_run_diff(
    State(state): State<RunDiffState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);
    let Some(run) = state.run_repo.get(run_id).await? else {
        return Err(AppError::NotFound("run not found"));
    };

    if !run.use_worktree {
        return Err(AppError::Unprocessable(
            "run is not worktree-backed; diff endpoint is worktree-only in V1".into(),
        ));
    }

    let worktree_path = run
        .worktree_path
        .as_deref()
        .ok_or(AppError::NotFound("worktree"))?;

    let diff = match collect_run_diff(std::path::Path::new(worktree_path), &state.base_branch).await
    {
        Ok(d) => d,
        Err(DiffError::WorktreeMissing) => return Err(AppError::NotFound("worktree")),
        Err(DiffError::Git(err)) => return Err(AppError::Internal(err)),
    };

    Ok(Json(RunDiffResponse {
        run: RunDiffRun {
            id: run.id.0.to_string(),
            use_worktree: run.use_worktree,
            worktree_path: run.worktree_path.clone(),
            branch_name: run.branch_name.clone(),
        },
        diff,
    }))
}
