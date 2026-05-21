use axum::extract::{Path, State};
use axum::response::{IntoResponse, Json};
use serde::Deserialize;

use superkick_core::LinkedRunSummary;
use superkick_integrations::linear::IssueStateMutation;
use superkick_storage::repo::RunRepo;

use crate::AppState;
use crate::error::AppError;
use crate::handlers::runs::resolve_pr_summary;

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

    let response = client.list_issues(params.limit).await?;

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

    let mut detail = client.get_issue(&id).await?;

    let runs = state
        .run_repo
        .list_by_issue_identifier(&detail.identifier)
        .await?;
    let mut summaries = Vec::with_capacity(runs.len());
    for run in &runs {
        let pr = resolve_pr_summary(&state, run.id, &run.repo_slug).await;
        summaries.push(LinkedRunSummary::from(run).with_pr(pr));
    }
    detail.linked_runs = summaries;

    Ok(Json(detail))
}

/// Operator-facing target state for `PATCH /issues/{id}` — only lanes that map to a Linear workflow-state `type`.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum IssueStateMutable {
    Open,
    InProgress,
    Done,
}

impl From<IssueStateMutable> for IssueStateMutation {
    fn from(state: IssueStateMutable) -> Self {
        match state {
            IssueStateMutable::Open => IssueStateMutation::Open,
            IssueStateMutable::InProgress => IssueStateMutation::InProgress,
            IssueStateMutable::Done => IssueStateMutation::Done,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct PatchIssueRequest {
    pub state: IssueStateMutable,
    /// Linear team UUID. When the UI supplies it, the client skips a team-lookup hop.
    #[serde(default)]
    pub team_id: Option<String>,
}

pub async fn patch_issue(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<PatchIssueRequest>,
) -> Result<impl IntoResponse, AppError> {
    let client = state
        .linear_client
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("LINEAR_API_KEY not configured"))?;

    client
        .update_issue_state(
            &id,
            body.team_id.as_deref(),
            IssueStateMutation::from(body.state),
        )
        .await?;

    Ok(axum::http::StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patch_request_accepts_persistable_states() {
        let cases = [
            (r#"{"state":"open"}"#, IssueStateMutable::Open),
            (r#"{"state":"in_progress"}"#, IssueStateMutable::InProgress),
            (r#"{"state":"done"}"#, IssueStateMutable::Done),
        ];
        for (raw, expected) in cases {
            let parsed: PatchIssueRequest = serde_json::from_str(raw).expect("valid state");
            assert_eq!(parsed.state, expected, "state for {raw}");
            assert!(
                parsed.team_id.is_none(),
                "team_id defaults to None for {raw}"
            );
        }
    }

    #[test]
    fn patch_request_threads_team_id() {
        let raw = r#"{"state":"in_progress","team_id":"team-uuid"}"#;
        let parsed: PatchIssueRequest = serde_json::from_str(raw).expect("valid body");
        assert_eq!(parsed.state, IssueStateMutable::InProgress);
        assert_eq!(parsed.team_id.as_deref(), Some("team-uuid"));
    }

    #[test]
    fn patch_request_rejects_non_persistable_states() {
        for raw in [
            r#"{"state":"needs_human"}"#,
            r#"{"state":"in_review"}"#,
            r#"{"state":"backlog"}"#,
            r#"{"state":"todo"}"#,
            r#"{"state":"canceled"}"#,
        ] {
            assert!(
                serde_json::from_str::<PatchIssueRequest>(raw).is_err(),
                "{raw} should not deserialize",
            );
        }
    }

    #[test]
    fn issue_state_mutable_maps_to_linear_mutation() {
        assert_eq!(
            IssueStateMutation::from(IssueStateMutable::Open).linear_state_type(),
            "unstarted",
        );
        assert_eq!(
            IssueStateMutation::from(IssueStateMutable::InProgress).linear_state_type(),
            "started",
        );
        assert_eq!(
            IssueStateMutation::from(IssueStateMutable::Done).linear_state_type(),
            "completed",
        );
    }
}
