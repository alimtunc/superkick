//! Axum route handlers for the launch queue.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use chrono::Utc;
use serde::Deserialize;
use superkick_core::{OrchestrationInputs, QueueIssueInput, QueueRunInput, classify_launch_queue};

use crate::AppState;
use crate::error::AppError;
use crate::handlers::queue_common::load_triages;
use crate::handlers::runs::{CreateRunRequest, spawn_run_from_request};

use super::merge::merge_into_groups;
use super::wire::{ActiveCapacity, LaunchQueueResponse};

pub async fn get_queue(
    State(state): State<AppState>,
) -> Result<Json<LaunchQueueResponse>, AppError> {
    // Linear may be unconfigured locally — we still want to render the run
    // side of the queue rather than 503 the whole surface.
    let linear_issues = match state.linear_client.as_ref() {
        Some(client) => match client.list_issues(200).await {
            Ok(resp) => resp.issues,
            Err(err) => {
                tracing::warn!(error = %err, "Linear list_issues failed; degrading to runs-only view");
                Vec::new()
            }
        },
        None => Vec::new(),
    };

    let triages = load_triages(&state).await?;

    let run_inputs: Vec<QueueRunInput> = triages
        .iter()
        .map(|t| QueueRunInput {
            run_id: t.run.id,
            issue_identifier: t.run.issue_identifier.clone(),
            state: t.run.state,
            operator_bucket: t.operator_bucket,
            reason: t.reason.clone(),
        })
        .collect();

    let issue_inputs: Vec<QueueIssueInput> = linear_issues
        .iter()
        .map(|issue| QueueIssueInput {
            id: issue.id.clone(),
            identifier: issue.identifier.clone(),
            state_type: issue.status.state_type.clone(),
            state_name: issue.status.name.clone(),
            priority_value: issue.priority.value,
            parent_identifier: issue.parent.as_ref().map(|p| p.identifier.clone()),
            parent_state_type: issue.parent.as_ref().map(|p| p.status.state_type.clone()),
        })
        .collect();

    let orchestration = &state.orchestration;
    let inputs = OrchestrationInputs {
        max_concurrent_active_runs: orchestration.max_concurrent_active_runs,
        approval_required_priorities: &orchestration.approval_required_for.priorities,
        trigger_state_type: state.issue_trigger.state_type(),
    };

    let classification = classify_launch_queue(issue_inputs, run_inputs, &inputs);
    let groups = merge_into_groups(&classification, &linear_issues, &triages);

    Ok(Json(LaunchQueueResponse {
        generated_at: Utc::now(),
        active_capacity: ActiveCapacity {
            current: classification.active_capacity_current,
            max: classification.active_capacity_max,
        },
        groups,
    }))
}

/// Inputs for dispatching a queued issue. All fields optional — the handler
/// falls back to the `launch_profile` defaults.
#[derive(Deserialize, Default)]
#[serde(default)]
pub struct DispatchRequest {
    pub use_worktree: Option<bool>,
    pub execution_mode: Option<superkick_core::ExecutionMode>,
    pub operator_instructions: Option<String>,
}

pub async fn dispatch_from_queue(
    Path(issue_identifier): Path<String>,
    State(state): State<AppState>,
    Json(body): Json<DispatchRequest>,
) -> Result<impl IntoResponse, AppError> {
    let issue_identifier = issue_identifier.trim().to_string();
    if issue_identifier.is_empty() {
        return Err(AppError::BadRequest(
            "issue_identifier must not be empty".into(),
        ));
    }

    let client = state
        .linear_client
        .as_ref()
        .ok_or(AppError::ServiceUnavailable(
            "LINEAR_API_KEY not configured",
        ))?;

    // Linear supports lookup by identifier via the `issue(id: "SUP-42")`
    // endpoint — GraphQL accepts either the UUID or the identifier.
    //
    // Error mapping relies on `LinearError::is_not_found` / `is_server_error`
    // via `impl From<LinearError> for AppError`, so transport and 5xx
    // failures surface as 503 instead of being collapsed into 404.
    let detail = client.get_issue(&issue_identifier).await?;

    if state.repo_slug.is_empty() {
        return Err(AppError::BadRequest(
            "server has no repo_slug configured; set a valid git remote or update config".into(),
        ));
    }

    let req = CreateRunRequest {
        repo_slug: state.repo_slug.clone(),
        issue_id: detail.id,
        issue_identifier: detail.identifier,
        base_branch: state.base_branch.clone(),
        use_worktree: body.use_worktree,
        execution_mode: body.execution_mode.unwrap_or_default(),
        operator_instructions: body.operator_instructions,
    };

    let run = spawn_run_from_request(&state, req).await?;
    Ok((StatusCode::CREATED, Json(run)))
}
