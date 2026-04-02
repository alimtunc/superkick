use std::sync::Arc;
use std::time::Duration;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Json};
use serde::Deserialize;
use tokio_util::sync::CancellationToken;

use superkick_core::{
    ArtifactKind, LinkedPrSummary, PullRequest, Run, RunId, TriggerSource, parse_pr_number,
};
use superkick_storage::repo::{
    AgentSessionRepo, ArtifactRepo, InterruptRepo, PullRequestRepo, RunEventRepo, RunRepo,
    RunStepRepo,
};

use crate::AppState;
use crate::error::AppError;

#[derive(Deserialize)]
pub struct CreateRunRequest {
    repo_slug: String,
    issue_id: String,
    issue_identifier: String,
    #[serde(default = "default_base_branch")]
    base_branch: String,
    /// Per-run worktree override. If absent, falls back to the launch profile default.
    use_worktree: Option<bool>,
    operator_instructions: Option<String>,
}

fn default_base_branch() -> String {
    "main".into()
}

pub async fn create_run(
    State(state): State<AppState>,
    Json(body): Json<CreateRunRequest>,
) -> Result<impl IntoResponse, AppError> {
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

    let existing = state
        .run_repo
        .find_active_by_issue_identifier(&issue_identifier)
        .await?;
    Run::guard_no_active(existing.as_ref(), &issue_identifier)?;

    let use_worktree = body
        .use_worktree
        .unwrap_or(state.launch_profile.use_worktree);

    let run = Run::new(
        issue_id,
        issue_identifier,
        repo_slug,
        TriggerSource::Manual,
        base_branch,
        use_worktree,
        operator_instructions,
    );

    if let Err(err) = state.run_repo.insert(&run).await {
        if is_unique_violation(&err) {
            // Re-check: the conflicting run may have finished between our guard and insert.
            let existing = state
                .run_repo
                .find_active_by_issue_identifier(&run.issue_identifier)
                .await?;
            return match Run::guard_no_active(existing.as_ref(), &run.issue_identifier) {
                // Still active → 409 Conflict
                Err(core_err) => Err(AppError::from(core_err)),
                // Race resolved: conflicting run finished between guard and insert.
                Ok(()) => Err(AppError::Internal(anyhow::anyhow!(
                    "unique constraint violated but no active run for issue {} — concurrent race resolved",
                    run.issue_identifier
                ))),
            };
        }
        return Err(AppError::Internal(err));
    }

    let engine = Arc::clone(&state.engine);
    let run_clone = run.clone();
    let token = CancellationToken::new();
    let spawn_token = token.clone();

    {
        let mut tokens = state.run_tokens.lock().await;
        tokens.insert(run.id, token);
    }

    let run_tokens = Arc::clone(&state.run_tokens);
    let run_id = run.id;
    tokio::spawn(async move {
        if let Err(e) = engine.execute(run_clone, spawn_token).await {
            tracing::error!(error = %e, "run execution failed");
        }
        run_tokens.lock().await.remove(&run_id);
    });

    Ok((StatusCode::CREATED, Json(run)))
}

pub async fn list_runs(State(state): State<AppState>) -> Result<Json<Vec<Run>>, AppError> {
    let runs = state.run_repo.list_all().await?;
    Ok(Json(runs))
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
    let pr = resolve_pr(&state, run_id, &run.repo_slug).await;

    Ok(Json(serde_json::json!({
        "run": run,
        "steps": steps,
        "sessions": sessions,
        "interrupts": interrupts,
        "pr": pr,
    })))
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

    {
        let mut tokens = state.run_tokens.lock().await;
        if let Some(token) = tokens.remove(&run_id) {
            token.cancel();
        }
    }

    let Some(mut run) = state.run_repo.get(run_id).await? else {
        return Err(AppError::NotFound("run not found"));
    };
    if run.state.is_terminal() {
        return Ok(Json(run));
    }

    run.transition_to(superkick_core::RunState::Cancelled)
        .map_err(|e| AppError::Internal(e.into()))?;
    state.run_repo.update(&run).await?;
    Ok(Json(run))
}

/// Resolve the PullRequest for a run. Lazily creates a record from the PrUrl
/// artifact if one doesn't exist yet. Syncs state from GitHub if stale.
pub(crate) async fn resolve_pr(
    state: &AppState,
    run_id: RunId,
    repo_slug: &str,
) -> Option<PullRequest> {
    // Check for existing PR record first.
    if let Ok(Some(mut pr)) = state.pr_repo.get_by_run(run_id).await {
        // Sync from GitHub if PR is in a non-terminal state and stale (>60s).
        if !pr.state.is_terminal() {
            let age = chrono::Utc::now() - pr.updated_at;
            if age.num_seconds() > 60 {
                sync_pr_state(state, &mut pr).await;
            }
        }
        return Some(pr);
    }

    // No PR record yet — try to create one from the PrUrl artifact.
    let pr_url = extract_pr_url_from_artifacts(state, run_id).await?;
    let number = parse_pr_number(&pr_url)?;

    let pr = PullRequest::new(
        run_id,
        number,
        repo_slug.to_string(),
        pr_url,
        String::new(),
        String::new(),
    );

    if let Err(e) = state.pr_repo.upsert(&pr).await {
        tracing::warn!(run_id = %run_id.0, error = %e, "failed to persist PullRequest record");
    }

    // Immediately sync to get title and current state.
    let mut pr = pr;
    sync_pr_state(state, &mut pr).await;
    Some(pr)
}

/// Extract a PR URL from the artifacts table (legacy path).
async fn extract_pr_url_from_artifacts(state: &AppState, run_id: RunId) -> Option<String> {
    let artifacts = state.artifact_repo.list_by_run(run_id).await.ok()?;
    artifacts
        .into_iter()
        .find(|a| a.kind == ArtifactKind::PrUrl)
        .map(|a| a.path_or_url)
}

/// Fetch current state from GitHub and update the local record.
async fn sync_pr_state(state: &AppState, pr: &mut PullRequest) {
    match superkick_integrations::github::fetch_pr_state(&pr.repo_slug, pr.number).await {
        Ok(gh) => {
            pr.state = gh.state;
            pr.title = gh.title;
            pr.merged_at = gh.merged_at;
            pr.updated_at = chrono::Utc::now();
            if let Err(e) = state.pr_repo.update(pr).await {
                tracing::warn!(pr_id = %pr.id, error = %e, "failed to update PR state");
            }
        }
        Err(e) => {
            tracing::debug!(pr_number = pr.number, error = %e, "GitHub PR sync failed (gh cli may not be available)");
        }
    }
}

/// Build a `LinkedPrSummary` for a run, used by the issues handler.
pub(crate) async fn resolve_pr_summary(
    state: &AppState,
    run_id: RunId,
    repo_slug: &str,
) -> Option<LinkedPrSummary> {
    resolve_pr(state, run_id, repo_slug)
        .await
        .as_ref()
        .map(LinkedPrSummary::from)
}

fn is_unique_violation(err: &anyhow::Error) -> bool {
    superkick_storage::is_unique_violation(err)
}
