use axum::extract::{Path, State};
use axum::response::{IntoResponse, Json};
use serde::Deserialize;

use superkick_core::LinkedRunSummary;
use superkick_storage::repo::RunRepo;

use crate::AppState;
use crate::error::AppError;
use crate::handlers::runs::extract_pr_url;

#[derive(Deserialize)]
pub struct ListIssuesParams {
    #[serde(default = "default_issue_limit")]
    limit: u32,
}

fn default_issue_limit() -> u32 {
    50
}

pub async fn list_issues(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<ListIssuesParams>,
) -> Result<impl IntoResponse, AppError> {
    let client = state
        .linear_client
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("LINEAR_API_KEY not configured"))?;

    let response = client
        .list_issues(params.limit)
        .await
        .map_err(AppError::Internal)?;

    Ok(Json(response))
}

pub async fn get_issue(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let client = state
        .linear_client
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("LINEAR_API_KEY not configured"))?;

    let mut detail = client.get_issue(&id).await.map_err(AppError::Internal)?;

    let runs = state
        .run_repo
        .list_by_issue_identifier(&detail.identifier)
        .await?;
    let mut summaries = Vec::with_capacity(runs.len());
    for run in &runs {
        let pr_url = extract_pr_url(&state, run.id).await;
        summaries.push(LinkedRunSummary::from(run).with_pr_url(pr_url));
    }
    detail.linked_runs = summaries;

    Ok(Json(detail))
}
