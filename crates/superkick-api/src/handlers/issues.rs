use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use axum::extract::{FromRef, Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use chrono::NaiveDate;
use serde::de::{MapAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize};

use superkick_core::LinkedRunSummary;
use superkick_integrations::linear::{
    IssueComment, IssueCreateInput, IssueDetailResponse, IssueStateMutation, IssueUpdateInput,
    LinearClient, LinearError, LinearOptions,
};
use superkick_storage::repo::{IssueCleanOutcome, IssueCleanRepo, RunRepo};

use crate::AppState;
use crate::error::AppError;

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
    let client = state.linear()?;

    let response = client.list_issues(params.limit).await?;

    Ok(Json(response))
}

pub async fn get_issue(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let client = state.linear()?;

    let mut detail = client.get_issue(&id).await?;

    let runs = state
        .run_repo
        .list_by_issue_identifier(&detail.identifier)
        .await?;
    let pr_service = &state.pr_service;
    let summaries = futures_util::future::join_all(runs.iter().map(|run| async move {
        let pr = pr_service.resolve_pr_summary(run.id, &run.repo_slug).await;
        LinkedRunSummary::from(run).with_pr(pr)
    }))
    .await;
    detail.linked_runs = summaries;
    detail.linked_prs = state.issue_pr_service.sync_issue_prs(&detail).await;

    Ok(Json(detail))
}

#[derive(Debug, Deserialize)]
pub struct IssuePullRequestDiffParams {
    repo_slug: String,
    number: u32,
}

pub async fn get_issue_pull_request_diff(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<IssuePullRequestDiffParams>,
) -> Result<impl IntoResponse, AppError> {
    let client = state.linear()?;
    let detail = client.get_issue(&id).await?;
    let _ = state.issue_pr_service.sync_issue_prs(&detail).await;
    let diff = state
        .issue_pr_service
        .diff_files(
            &detail.id,
            &detail.identifier,
            &params.repo_slug,
            params.number,
        )
        .await?;

    Ok(Json(diff))
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

/// Three-state PATCH field: `Missing` (key absent), `Null` (`"key": null`,
/// clear on Linear), `Set(v)`. Lowers to `IssueUpdateInput`'s
/// `Option<Option<T>>` so the integration layer never sees this enum.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(crate) enum Patchable<T> {
    #[default]
    Missing,
    Null,
    Set(T),
}

impl<T> Patchable<T> {
    pub fn into_double_option(self) -> Option<Option<T>> {
        match self {
            Patchable::Missing => None,
            Patchable::Null => Some(None),
            Patchable::Set(v) => Some(Some(v)),
        }
    }
}

fn patchable_from_option<T>(opt: Option<T>) -> Patchable<T> {
    match opt {
        Some(v) => Patchable::Set(v),
        None => Patchable::Null,
    }
}

#[derive(Clone)]
pub struct IssueWritesState {
    pub linear_writer: Option<Arc<dyn LinearWriter>>,
}

impl FromRef<AppState> for IssueWritesState {
    fn from_ref(state: &AppState) -> Self {
        let linear_writer = state
            .linear_client
            .as_ref()
            .map(|client| Arc::clone(client) as Arc<dyn LinearWriter>);
        Self { linear_writer }
    }
}

pub(crate) fn require_writer(state: &IssueWritesState) -> Result<&Arc<dyn LinearWriter>, AppError> {
    state
        .linear_writer
        .as_ref()
        .ok_or(AppError::ServiceUnavailable(crate::LINEAR_NOT_CONFIGURED))
}

pub type LinearFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, LinearError>> + Send + 'a>>;

pub trait LinearWriter: Send + Sync {
    fn create_issue<'a>(&'a self, input: IssueCreateInput)
    -> LinearFuture<'a, IssueDetailResponse>;
    fn update_issue<'a>(
        &'a self,
        id: &'a str,
        input: IssueUpdateInput,
    ) -> LinearFuture<'a, IssueDetailResponse>;
    fn create_comment<'a>(
        &'a self,
        issue_id: &'a str,
        body: &'a str,
    ) -> LinearFuture<'a, IssueComment>;
    fn list_options<'a>(&'a self) -> LinearFuture<'a, LinearOptions>;
    fn resolve_workflow_state_for_type<'a>(
        &'a self,
        team_id: Option<&'a str>,
        target_type: &'a str,
        issue_id_for_lookup: Option<&'a str>,
    ) -> LinearFuture<'a, String>;
}

impl LinearWriter for LinearClient {
    fn create_issue<'a>(
        &'a self,
        input: IssueCreateInput,
    ) -> LinearFuture<'a, IssueDetailResponse> {
        Box::pin(LinearClient::create_issue(self, input))
    }
    fn update_issue<'a>(
        &'a self,
        id: &'a str,
        input: IssueUpdateInput,
    ) -> LinearFuture<'a, IssueDetailResponse> {
        Box::pin(LinearClient::update_issue(self, id, input))
    }
    fn create_comment<'a>(
        &'a self,
        issue_id: &'a str,
        body: &'a str,
    ) -> LinearFuture<'a, IssueComment> {
        Box::pin(LinearClient::create_comment(self, issue_id, body))
    }
    fn list_options<'a>(&'a self) -> LinearFuture<'a, LinearOptions> {
        Box::pin(LinearClient::list_options(self))
    }
    fn resolve_workflow_state_for_type<'a>(
        &'a self,
        team_id: Option<&'a str>,
        target_type: &'a str,
        issue_id_for_lookup: Option<&'a str>,
    ) -> LinearFuture<'a, String> {
        Box::pin(LinearClient::resolve_workflow_state_for_type(
            self,
            team_id,
            target_type,
            issue_id_for_lookup,
        ))
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateIssueRequest {
    pub team_id: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub state_id: Option<String>,
    #[serde(default)]
    pub assignee_id: Option<String>,
    #[serde(default)]
    pub priority: Option<u8>,
    #[serde(default)]
    pub label_ids: Option<Vec<String>>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub estimate: Option<f32>,
}

pub async fn create_issue(
    State(state): State<IssueWritesState>,
    Json(body): Json<CreateIssueRequest>,
) -> Result<axum::response::Response, AppError> {
    let writer = require_writer(&state)?;
    validate_create_issue(&body)?;
    let input = IssueCreateInput {
        team_id: body.team_id,
        title: body.title.trim().to_string(),
        description: body.description,
        state_id: body.state_id,
        assignee_id: body.assignee_id,
        priority: body.priority,
        label_ids: body.label_ids,
        project_id: body.project_id,
        due_date: body.due_date,
        estimate: body.estimate,
    };
    let detail = writer.create_issue(input).await?;
    let location = format!("/issues/{}", detail.id);
    let mut response = (StatusCode::CREATED, Json(detail)).into_response();
    match axum::http::HeaderValue::from_str(&location) {
        Ok(value) => {
            response.headers_mut().insert("Location", value);
        }
        Err(err) => tracing::warn!(
            %location,
            %err,
            "skipping Location header: issue id is not a valid header value",
        ),
    }
    Ok(response)
}

fn validate_create_issue(body: &CreateIssueRequest) -> Result<(), AppError> {
    if body.team_id.trim().is_empty() {
        return Err(AppError::BadRequest("team_id must not be empty".into()));
    }
    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("title must not be empty".into()));
    }
    validate_priority(body.priority)?;
    validate_due_date(body.due_date.as_deref())?;
    Ok(())
}

fn validate_priority(priority: Option<u8>) -> Result<(), AppError> {
    if let Some(p) = priority {
        if p > 4 {
            return Err(AppError::BadRequest("priority must be 0..=4".into()));
        }
    }
    Ok(())
}

fn validate_due_date(due_date: Option<&str>) -> Result<(), AppError> {
    if let Some(raw) = due_date {
        NaiveDate::parse_from_str(raw, "%Y-%m-%d")
            .map_err(|_| AppError::BadRequest("due_date must be in YYYY-MM-DD format".into()))?;
    }
    Ok(())
}

#[derive(Debug, Default)]
pub struct PatchIssueRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub state: Option<IssueStateMutable>,
    pub state_id: Option<String>,
    pub team_id: Option<String>,
    pub assignee_id: Patchable<String>,
    pub priority: Option<u8>,
    pub label_ids: Option<Vec<String>>,
    pub project_id: Patchable<String>,
    pub due_date: Patchable<String>,
    pub estimate: Patchable<f32>,
}

impl<'de> Deserialize<'de> for PatchIssueRequest {
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        struct PatchVisitor;

        impl<'de> Visitor<'de> for PatchVisitor {
            type Value = PatchIssueRequest;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a PATCH /issues body")
            }

            fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
                let mut out = PatchIssueRequest::default();
                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "title" => out.title = map.next_value()?,
                        "description" => out.description = map.next_value()?,
                        "state" => out.state = map.next_value()?,
                        "state_id" => out.state_id = map.next_value()?,
                        "team_id" => out.team_id = map.next_value()?,
                        "priority" => out.priority = map.next_value()?,
                        "label_ids" => out.label_ids = map.next_value()?,
                        "assignee_id" => {
                            out.assignee_id =
                                patchable_from_option(map.next_value::<Option<String>>()?);
                        }
                        "project_id" => {
                            out.project_id =
                                patchable_from_option(map.next_value::<Option<String>>()?);
                        }
                        "due_date" => {
                            out.due_date =
                                patchable_from_option(map.next_value::<Option<String>>()?);
                        }
                        "estimate" => {
                            out.estimate = patchable_from_option(map.next_value::<Option<f32>>()?);
                        }
                        // Unknown field: drain the value and ignore. Linear's
                        // wire grows over time; we don't want every new
                        // optional UI input to bounce off the API.
                        _ => {
                            let _ignored: serde_json::Value = map.next_value()?;
                        }
                    }
                }
                Ok(out)
            }
        }

        de.deserialize_map(PatchVisitor)
    }
}

pub async fn patch_issue(
    State(state): State<IssueWritesState>,
    Path(id): Path<String>,
    Json(body): Json<PatchIssueRequest>,
) -> Result<Json<IssueDetailResponse>, AppError> {
    let writer = require_writer(&state)?;
    validate_patch_issue(&body)?;
    let input = build_update_input(writer, &id, body).await?;
    let detail = writer.update_issue(&id, input).await?;
    Ok(Json(detail))
}

fn validate_patch_issue(body: &PatchIssueRequest) -> Result<(), AppError> {
    if body.state.is_some() && body.state_id.is_some() {
        return Err(AppError::BadRequest(
            "provide either `state` or `state_id`, not both".into(),
        ));
    }
    validate_priority(body.priority)?;
    let due_date_to_check = match &body.due_date {
        Patchable::Set(v) => Some(v.as_str()),
        _ => None,
    };
    validate_due_date(due_date_to_check)?;
    if patch_has_no_fields(body) {
        return Err(AppError::BadRequest(
            "at least one field is required".into(),
        ));
    }
    Ok(())
}

fn patch_has_no_fields(body: &PatchIssueRequest) -> bool {
    body.title.is_none()
        && body.description.is_none()
        && body.state.is_none()
        && body.state_id.is_none()
        && matches!(body.assignee_id, Patchable::Missing)
        && body.priority.is_none()
        && body.label_ids.is_none()
        && matches!(body.project_id, Patchable::Missing)
        && matches!(body.due_date, Patchable::Missing)
        && matches!(body.estimate, Patchable::Missing)
}

async fn build_update_input(
    writer: &Arc<dyn LinearWriter>,
    issue_id: &str,
    body: PatchIssueRequest,
) -> Result<IssueUpdateInput, AppError> {
    let state_id = match (body.state, body.state_id) {
        (Some(state), None) => Some(
            writer
                .resolve_workflow_state_for_type(
                    body.team_id.as_deref(),
                    IssueStateMutation::from(state).linear_state_type(),
                    Some(issue_id),
                )
                .await?,
        ),
        (None, Some(state_id)) => Some(state_id),
        (None, None) => None,
        // `validate_patch_issue` rejects this before we get here; guard
        // defensively rather than panicking the handler if that ever changes.
        (Some(_), Some(_)) => {
            return Err(AppError::BadRequest(
                "provide either `state` or `state_id`, not both".into(),
            ));
        }
    };

    Ok(IssueUpdateInput {
        title: body.title,
        description: body.description,
        state_id,
        assignee_id: body.assignee_id.into_double_option(),
        priority: body.priority,
        label_ids: body.label_ids,
        project_id: body.project_id.into_double_option(),
        due_date: body.due_date.into_double_option(),
        estimate: body.estimate.into_double_option(),
    })
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentRequest {
    pub body: String,
}

pub async fn create_comment(
    State(state): State<IssueWritesState>,
    Path(id): Path<String>,
    Json(body): Json<CreateCommentRequest>,
) -> Result<axum::response::Response, AppError> {
    let writer = require_writer(&state)?;
    let trimmed = body.body.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("body must not be empty".into()));
    }
    let comment = writer.create_comment(&id, trimmed).await?;
    Ok((StatusCode::CREATED, Json(comment)).into_response())
}

/// Operator-chosen clean mode. `Archive` is stats-safe (hides from the feed,
/// retains rows); `Purge` hard-deletes and is the only destructive path, so it
/// must be requested explicitly.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CleanMode {
    Archive,
    Purge,
}

#[derive(Debug, Deserialize)]
pub struct CleanIssueRequest {
    pub mode: CleanMode,
}

#[derive(Serialize)]
pub struct CleanIssueResponse {
    pub mode: &'static str,
    #[serde(flatten)]
    pub outcome: IssueCleanOutcome,
}

/// Resolve whatever `{id}` the UI sent (Linear identifier like `SUP-122` or a
/// Linear UUID) to the stable identifier the local run/launch-task tables key
/// off. Without Linear configured the raw param is the identifier, so the
/// purely-local clean still works. With Linear configured a lookup failure is
/// propagated rather than swallowed — a destructive purge must not silently key
/// off the wrong identifier and report success while deleting nothing.
async fn resolve_issue_identifier(state: &AppState, id: &str) -> Result<String, AppError> {
    let Some(client) = state.linear_client.as_ref() else {
        return Ok(id.to_string());
    };
    Ok(client.get_issue(id).await?.identifier)
}

/// `POST /issues/{id}/clean` — archive (stats-safe) or purge (destructive) every
/// run + launch task linked to the issue. `purge` hard-deletes and must be
/// requested explicitly via `{ "mode": "purge" }`.
pub async fn clean_issue(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<CleanIssueRequest>,
) -> Result<Json<CleanIssueResponse>, AppError> {
    let identifier = resolve_issue_identifier(&state, &id).await?;
    let (mode, outcome) = match body.mode {
        CleanMode::Archive => (
            "archive",
            state
                .issue_clean_repo
                .archive_issue(&identifier, chrono::Utc::now())
                .await?,
        ),
        CleanMode::Purge => (
            "purge",
            state.issue_clean_repo.purge_issue(&identifier).await?,
        ),
    };
    Ok(Json(CleanIssueResponse { mode, outcome }))
}

#[derive(Clone)]
pub struct ReusableWorktreeState {
    pub run_repo: Arc<superkick_storage::SqliteRunRepo>,
}

impl FromRef<AppState> for ReusableWorktreeState {
    fn from_ref(state: &AppState) -> Self {
        Self {
            run_repo: Arc::clone(&state.run_repo),
        }
    }
}

#[derive(Serialize)]
pub struct ReusableWorktreeResponse {
    pub run_id: String,
    pub worktree_path: String,
    pub branch_name: String,
}

const NO_REUSABLE_WORKTREE: &str = "no reusable worktree for issue";

/// Return the newest non-archived finished run whose worktree still survives on
/// disk, so a fresh launch can run against it instead of minting a new worktree.
/// 404 when the issue has an active run (reuse would collide with the live
/// worktree) or no reusable worktree exists.
pub async fn get_reusable_worktree(
    State(state): State<ReusableWorktreeState>,
    Path(identifier): Path<String>,
) -> Result<Json<ReusableWorktreeResponse>, AppError> {
    if state
        .run_repo
        .find_active_by_issue_identifier(&identifier)
        .await?
        .is_some()
    {
        return Err(AppError::NotFound(NO_REUSABLE_WORKTREE));
    }

    let runs = state.run_repo.list_by_issue_identifier(&identifier).await?;
    let run = runs
        .into_iter()
        .find(reusable_worktree_run)
        .ok_or(AppError::NotFound(NO_REUSABLE_WORKTREE))?;

    let (worktree_path, branch_name) = run
        .worktree_path
        .zip(run.branch_name)
        .ok_or(AppError::NotFound(NO_REUSABLE_WORKTREE))?;

    Ok(Json(ReusableWorktreeResponse {
        run_id: run.id.0.to_string(),
        worktree_path,
        branch_name,
    }))
}

fn reusable_worktree_run(run: &superkick_core::Run) -> bool {
    run.state.is_terminal()
        && run.use_worktree
        && run
            .worktree_path
            .as_deref()
            .is_some_and(|path| std::fs::metadata(path).is_ok())
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
            assert_eq!(parsed.state, Some(expected), "state for {raw}");
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
        assert_eq!(parsed.state, Some(IssueStateMutable::InProgress));
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

    #[test]
    fn patch_request_distinguishes_missing_null_and_value_on_assignee() {
        let missing: PatchIssueRequest = serde_json::from_str("{}").expect("empty");
        assert_eq!(missing.assignee_id, Patchable::Missing);

        let null: PatchIssueRequest =
            serde_json::from_str(r#"{"assignee_id":null}"#).expect("null");
        assert_eq!(null.assignee_id, Patchable::Null);

        let set: PatchIssueRequest =
            serde_json::from_str(r#"{"assignee_id":"u-1"}"#).expect("value");
        assert_eq!(set.assignee_id, Patchable::Set("u-1".to_string()));
    }

    #[test]
    fn patch_request_distinguishes_missing_null_and_value_on_project_due_date_estimate() {
        let raw = r#"{"project_id":null,"due_date":"2026-06-15","estimate":3.5}"#;
        let parsed: PatchIssueRequest = serde_json::from_str(raw).expect("parse");
        assert_eq!(parsed.project_id, Patchable::Null);
        assert_eq!(parsed.due_date, Patchable::Set("2026-06-15".into()));
        assert_eq!(parsed.estimate, Patchable::Set(3.5));
    }

    #[test]
    fn patch_request_rejects_both_state_and_state_id() {
        let body: PatchIssueRequest =
            serde_json::from_str(r#"{"state":"in_progress","state_id":"s-1"}"#).expect("parse");
        let err = validate_patch_issue(&body).expect_err("should reject");
        match err {
            AppError::BadRequest(msg) => {
                assert!(msg.contains("state"), "msg = {msg}");
            }
            other => panic!("expected BadRequest, got {other:?}"),
        }
    }

    #[test]
    fn patch_request_rejects_empty_body() {
        let body: PatchIssueRequest = serde_json::from_str("{}").expect("parse");
        let err = validate_patch_issue(&body).expect_err("should reject");
        match err {
            AppError::BadRequest(msg) => {
                assert!(msg.contains("required"), "msg = {msg}");
            }
            other => panic!("expected BadRequest, got {other:?}"),
        }
    }

    #[test]
    fn patch_request_rejects_invalid_priority() {
        let body: PatchIssueRequest = serde_json::from_str(r#"{"priority":5}"#).expect("parse");
        let err = validate_patch_issue(&body).expect_err("should reject");
        match err {
            AppError::BadRequest(msg) => assert!(msg.contains("priority"), "msg = {msg}"),
            other => panic!("expected BadRequest, got {other:?}"),
        }
    }

    #[test]
    fn patch_request_rejects_invalid_due_date_format() {
        let body: PatchIssueRequest =
            serde_json::from_str(r#"{"due_date":"15/06/2026"}"#).expect("parse");
        let err = validate_patch_issue(&body).expect_err("should reject");
        match err {
            AppError::BadRequest(msg) => assert!(msg.contains("due_date"), "msg = {msg}"),
            other => panic!("expected BadRequest, got {other:?}"),
        }
    }

    #[test]
    fn create_issue_request_parses_minimal_body() {
        let parsed: CreateIssueRequest =
            serde_json::from_str(r#"{"team_id":"t-1","title":"Fix it"}"#).expect("parse");
        assert_eq!(parsed.team_id, "t-1");
        assert_eq!(parsed.title, "Fix it");
        assert!(parsed.description.is_none());
        assert!(parsed.priority.is_none());
    }

    #[test]
    fn create_issue_request_parses_full_body() {
        let raw = r#"{
            "team_id": "t-1",
            "title": "Fix Safari",
            "description": "Some markdown",
            "state_id": "s-1",
            "assignee_id": "u-1",
            "priority": 3,
            "label_ids": ["l-1", "l-2"],
            "project_id": "p-1",
            "due_date": "2026-06-15",
            "estimate": 2.5
        }"#;
        let parsed: CreateIssueRequest = serde_json::from_str(raw).expect("parse");
        assert_eq!(parsed.priority, Some(3));
        assert_eq!(parsed.label_ids.unwrap(), vec!["l-1", "l-2"]);
        assert_eq!(parsed.estimate, Some(2.5));
        assert_eq!(parsed.due_date.as_deref(), Some("2026-06-15"));
    }

    #[test]
    fn create_issue_request_rejects_invalid_priority() {
        let body = CreateIssueRequest {
            team_id: "t-1".into(),
            title: "x".into(),
            description: None,
            state_id: None,
            assignee_id: None,
            priority: Some(7),
            label_ids: None,
            project_id: None,
            due_date: None,
            estimate: None,
        };
        let err = validate_create_issue(&body).expect_err("rejects priority");
        match err {
            AppError::BadRequest(msg) => assert!(msg.contains("priority"), "msg = {msg}"),
            other => panic!("expected BadRequest, got {other:?}"),
        }
    }

    #[test]
    fn create_issue_request_rejects_empty_title_after_trim() {
        let body = CreateIssueRequest {
            team_id: "t-1".into(),
            title: "   ".into(),
            description: None,
            state_id: None,
            assignee_id: None,
            priority: None,
            label_ids: None,
            project_id: None,
            due_date: None,
            estimate: None,
        };
        let err = validate_create_issue(&body).expect_err("rejects empty title");
        match err {
            AppError::BadRequest(msg) => assert!(msg.contains("title"), "msg = {msg}"),
            other => panic!("expected BadRequest, got {other:?}"),
        }
    }

    #[test]
    fn create_issue_request_rejects_invalid_due_date() {
        let body = CreateIssueRequest {
            team_id: "t-1".into(),
            title: "x".into(),
            description: None,
            state_id: None,
            assignee_id: None,
            priority: None,
            label_ids: None,
            project_id: None,
            due_date: Some("not-a-date".into()),
            estimate: None,
        };
        let err = validate_create_issue(&body).expect_err("rejects due_date");
        match err {
            AppError::BadRequest(msg) => assert!(msg.contains("due_date"), "msg = {msg}"),
            other => panic!("expected BadRequest, got {other:?}"),
        }
    }

    #[test]
    fn create_comment_request_parses() {
        let parsed: CreateCommentRequest = serde_json::from_str(r#"{"body":"yo"}"#).expect("parse");
        assert_eq!(parsed.body, "yo");
    }
}
