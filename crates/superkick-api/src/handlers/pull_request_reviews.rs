//! SUP-205 — GitHub PR review surface.
//!
//! The current project resolves to a single GitHub repo (`AppState.repo_slug`),
//! so PRs are addressed by number alone. Inbox/detail/activity/diff/submit are
//! composed by `PrReviewService`; the local staged-comment CRUD reuses the
//! subject-polymorphic `DiffReviewRepo` with a `PullRequest` subject.

use std::sync::Arc;

use axum::extract::{FromRef, Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::{Deserialize, Serialize};

use superkick_core::{
    DiffReviewAnchor, DiffReviewComment, DiffReviewCommentId, DiffReviewFileReviewedChange,
    DiffReviewFileState, DiffReviewLineSide, DiffReviewState, DiffReviewSubject, DiffReviewThread,
    DiffReviewThreadId, PrActivityEvent, PrDiffFile, PrInboxItem, PrReviewDetail, PrReviewEvent,
    Run, render_diff_review_fix_prompt, unresolved_diff_review_fix_prompt_comments,
};
use superkick_runtime::PrReviewService;
use superkick_storage::repo::{DiffReviewRepo, RunRepo};
use superkick_storage::{SqliteDiffReviewRepo, SqliteRunRepo};

use crate::AppState;
use crate::error::AppError;
use crate::handlers::runs::spawn_diff_review_fix_run;

#[derive(Clone)]
pub struct PrReviewState {
    pub service: Arc<PrReviewService<SqliteDiffReviewRepo>>,
    pub review_repo: Arc<SqliteDiffReviewRepo>,
    pub run_repo: Arc<SqliteRunRepo>,
    pub repo_slug: String,
}

impl FromRef<AppState> for PrReviewState {
    fn from_ref(state: &AppState) -> Self {
        Self {
            service: Arc::clone(&state.pr_review_service),
            review_repo: Arc::clone(&state.review_repo),
            run_repo: Arc::clone(&state.run_repo),
            repo_slug: state.repo_slug.clone(),
        }
    }
}

// ── Request / response DTOs ───────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadShaQuery {
    #[serde(default)]
    pub head_sha: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePrThreadRequest {
    pub head_sha: Option<String>,
    pub file_path: String,
    pub old_path: Option<String>,
    pub side: DiffReviewLineSide,
    pub old_line: Option<u32>,
    pub old_line_end: Option<u32>,
    pub new_line: Option<u32>,
    pub new_line_end: Option<u32>,
    pub hunk_header: Option<String>,
    pub hunk_index: Option<u32>,
    pub base_ref: Option<String>,
    pub head_ref: Option<String>,
    pub author: Option<String>,
    pub body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePrCommentRequest {
    pub author: Option<String>,
    pub body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchPrThreadRequest {
    pub resolved: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchPrCommentRequest {
    pub body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPrFileReviewedRequest {
    pub head_sha: Option<String>,
    pub file_path: String,
    pub old_path: Option<String>,
    pub reviewed: bool,
    pub reviewer: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitReviewRequest {
    pub head_sha: String,
    pub event: PrReviewEvent,
    #[serde(default)]
    pub body: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitReviewResponse {
    pub anchored_comments: usize,
    pub fallback_comments: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrDiffResponse {
    pub files: Vec<PrDiffFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrFixWithAiResponse {
    pub run: Run,
    pub unresolved_comment_count: u32,
    pub linked: bool,
}

// ── gh-composed read endpoints ────────────────────────────────────────────

pub async fn list_inbox(
    State(state): State<PrReviewState>,
) -> Result<Json<Vec<PrInboxItem>>, AppError> {
    Ok(Json(state.service.inbox().await?))
}

pub async fn get_detail(
    State(state): State<PrReviewState>,
    Path(number): Path<u32>,
) -> Result<Json<PrReviewDetail>, AppError> {
    let mut detail = state
        .service
        .detail(&state.repo_slug, number, None, None)
        .await?;
    if let Some(run) =
        find_run_by_branch(state.run_repo.as_ref(), &detail.pull_request.head_branch).await
    {
        detail.pull_request.linked_issue_identifier = Some(run.issue_identifier);
        detail.linked_issue_id = Some(run.issue_id);
    }
    Ok(Json(detail))
}

pub async fn get_diff(
    State(state): State<PrReviewState>,
    Path(number): Path<u32>,
) -> Result<Json<PrDiffResponse>, AppError> {
    let files = state.service.diff(&state.repo_slug, number).await?;
    Ok(Json(PrDiffResponse { files }))
}

pub async fn get_activity(
    State(state): State<PrReviewState>,
    Path(number): Path<u32>,
) -> Result<Json<Vec<PrActivityEvent>>, AppError> {
    Ok(Json(
        state.service.activity(&state.repo_slug, number).await?,
    ))
}

// ── Local staged-comment CRUD (PR subject) ────────────────────────────────

pub async fn get_review(
    State(state): State<PrReviewState>,
    Path(number): Path<u32>,
    Query(query): Query<HeadShaQuery>,
) -> Result<Json<DiffReviewState>, AppError> {
    let subject = state.subject(number, query.head_sha);
    Ok(Json(state.review_repo.list_by_subject(subject).await?))
}

pub async fn create_thread(
    State(state): State<PrReviewState>,
    Path(number): Path<u32>,
    Json(body): Json<CreatePrThreadRequest>,
) -> Result<impl IntoResponse, AppError> {
    let subject = state.subject(number, body.head_sha.clone());
    let thread = state
        .review_repo
        .create_thread(superkick_core::NewDiffReviewThread {
            anchor: DiffReviewAnchor {
                subject,
                issue_id: None,
                file_path: body.file_path,
                old_path: normalize_optional(body.old_path),
                side: body.side,
                old_line: body.old_line,
                old_line_end: body.old_line_end,
                new_line: body.new_line,
                new_line_end: body.new_line_end,
                hunk_header: normalize_optional(body.hunk_header),
                hunk_index: body.hunk_index,
                base_ref: normalize_optional(body.base_ref),
                head_ref: normalize_optional(body.head_ref),
            },
            author: body.author,
            body: body.body,
        })
        .await
        .map_err(storage_or_bad_request)?;
    Ok((StatusCode::CREATED, Json(thread)))
}

pub async fn add_comment(
    State(state): State<PrReviewState>,
    Path((number, thread_id)): Path<(u32, uuid::Uuid)>,
    Json(body): Json<CreatePrCommentRequest>,
) -> Result<impl IntoResponse, AppError> {
    let thread_id = DiffReviewThreadId(thread_id);
    require_thread_for_pr(&state, number, thread_id).await?;
    let comment = state
        .review_repo
        .add_comment(
            thread_id,
            superkick_core::NewDiffReviewComment {
                author: body.author,
                body: body.body,
            },
        )
        .await
        .map_err(storage_or_bad_request)?;
    Ok((StatusCode::CREATED, Json(comment)))
}

pub async fn patch_thread(
    State(state): State<PrReviewState>,
    Path((number, thread_id)): Path<(u32, uuid::Uuid)>,
    Json(body): Json<PatchPrThreadRequest>,
) -> Result<Json<DiffReviewThread>, AppError> {
    let thread_id = DiffReviewThreadId(thread_id);
    require_thread_for_pr(&state, number, thread_id).await?;
    let thread = state
        .review_repo
        .set_thread_resolved(thread_id, body.resolved)
        .await?
        .ok_or(AppError::NotFound("review thread not found"))?;
    Ok(Json(thread))
}

pub async fn delete_thread(
    State(state): State<PrReviewState>,
    Path((number, thread_id)): Path<(u32, uuid::Uuid)>,
) -> Result<StatusCode, AppError> {
    let thread_id = DiffReviewThreadId(thread_id);
    require_thread_for_pr(&state, number, thread_id).await?;
    if !state.review_repo.delete_thread(thread_id).await? {
        return Err(AppError::NotFound("review thread not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn patch_comment(
    State(state): State<PrReviewState>,
    Path((number, thread_id, comment_id)): Path<(u32, uuid::Uuid, uuid::Uuid)>,
    Json(body): Json<PatchPrCommentRequest>,
) -> Result<Json<DiffReviewComment>, AppError> {
    let thread_id = DiffReviewThreadId(thread_id);
    let comment_id = DiffReviewCommentId(comment_id);
    let thread = require_thread_for_pr(&state, number, thread_id).await?;
    if !thread
        .comments
        .iter()
        .any(|comment| comment.id == comment_id)
    {
        return Err(AppError::NotFound("review comment not found"));
    }
    let comment = state
        .review_repo
        .update_comment(comment_id, body.body)
        .await
        .map_err(storage_or_bad_request)?
        .ok_or(AppError::NotFound("review comment not found"))?;
    Ok(Json(comment))
}

pub async fn delete_comment(
    State(state): State<PrReviewState>,
    Path((number, thread_id, comment_id)): Path<(u32, uuid::Uuid, uuid::Uuid)>,
) -> Result<StatusCode, AppError> {
    let thread_id = DiffReviewThreadId(thread_id);
    let comment_id = DiffReviewCommentId(comment_id);
    let thread = require_thread_for_pr(&state, number, thread_id).await?;
    if !thread
        .comments
        .iter()
        .any(|comment| comment.id == comment_id)
    {
        return Err(AppError::NotFound("review comment not found"));
    }
    if !state.review_repo.delete_comment(comment_id).await? {
        return Err(AppError::NotFound("review comment not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn set_file_reviewed(
    State(state): State<PrReviewState>,
    Path(number): Path<u32>,
    Json(body): Json<SetPrFileReviewedRequest>,
) -> Result<Json<DiffReviewFileState>, AppError> {
    let subject = state.subject(number, body.head_sha.clone());
    let reviewed = state
        .review_repo
        .set_file_reviewed(DiffReviewFileReviewedChange {
            subject,
            issue_id: None,
            file_path: body.file_path,
            old_path: normalize_optional(body.old_path),
            reviewed: body.reviewed,
            reviewer: body.reviewer,
        })
        .await
        .map_err(storage_or_bad_request)?;
    Ok(Json(reviewed))
}

// ── Submit + Fix with AI ──────────────────────────────────────────────────

pub async fn submit_review(
    State(state): State<PrReviewState>,
    Path(number): Path<u32>,
    Json(body): Json<SubmitReviewRequest>,
) -> Result<Json<SubmitReviewResponse>, AppError> {
    let outcome = state
        .service
        .submit(
            &state.repo_slug,
            number,
            &body.head_sha,
            body.event,
            &body.body,
        )
        .await?;
    Ok(Json(SubmitReviewResponse {
        anchored_comments: outcome.anchored_comments,
        fallback_comments: outcome.fallback_comments,
    }))
}

pub async fn fix_with_ai(
    State(state): State<AppState>,
    Path(number): Path<u32>,
    Query(query): Query<HeadShaQuery>,
) -> Result<Json<PrFixWithAiResponse>, AppError> {
    let repo_slug = state.repo_slug.clone();
    let subject = DiffReviewSubject::pull_request(
        repo_slug.clone(),
        number,
        query.head_sha.unwrap_or_default(),
    );
    let review = state.review_repo.list_by_subject(subject).await?;
    let comments = unresolved_diff_review_fix_prompt_comments(&review);
    if comments.is_empty() {
        return Err(AppError::Unprocessable(
            "no unresolved review comments to fix".into(),
        ));
    }

    let detail = state
        .pr_review_service
        .detail(&repo_slug, number, None, None)
        .await?;
    let pr = &detail.pull_request;

    // Reuse a known issue/worktree when the PR maps to a Superkick run by branch;
    // otherwise fall back to a prompt-only task that the launch flow resolves.
    let linked_run = find_run_by_branch(state.run_repo.as_ref(), &pr.head_branch).await;
    let linked = linked_run.is_some();
    let (issue_id, issue_identifier) = match &linked_run {
        Some(run) => (run.issue_id.clone(), run.issue_identifier.clone()),
        None => (format!("{repo_slug}#{number}"), format!("PR-{number}")),
    };

    let first_open = review
        .threads
        .iter()
        .find(|thread| thread.state == superkick_core::DiffReviewThreadState::Open);
    let base_ref = first_open
        .and_then(|thread| thread.anchor.base_ref.as_deref())
        .unwrap_or(pr.base_branch.as_str());
    let head_ref = first_open
        .and_then(|thread| thread.anchor.head_ref.as_deref())
        .unwrap_or(pr.head_branch.as_str());
    let prompt = render_diff_review_fix_prompt(
        &issue_identifier,
        &format!("PR {repo_slug}#{number}"),
        Some(pr.head_branch.as_str()),
        base_ref,
        head_ref,
        &comments,
        None,
    );

    let run = spawn_diff_review_fix_run(
        &state,
        repo_slug,
        issue_id,
        issue_identifier,
        pr.head_branch.clone(),
        prompt,
    )
    .await?;

    Ok(Json(PrFixWithAiResponse {
        run,
        unresolved_comment_count: review.unresolved_comment_count,
        linked,
    }))
}

// ── helpers ───────────────────────────────────────────────────────────────

impl PrReviewState {
    fn subject(&self, number: u32, head_sha: Option<String>) -> DiffReviewSubject {
        DiffReviewSubject::pull_request(
            self.repo_slug.clone(),
            number,
            head_sha.unwrap_or_default(),
        )
    }
}

async fn require_thread_for_pr(
    state: &PrReviewState,
    number: u32,
    thread_id: DiffReviewThreadId,
) -> Result<DiffReviewThread, AppError> {
    let thread = state
        .review_repo
        .get_thread(thread_id)
        .await?
        .ok_or(AppError::NotFound("review thread not found"))?;
    let matches = thread.anchor.subject.repo_slug() == Some(state.repo_slug.as_str())
        && thread.anchor.subject.pr_number() == Some(number);
    if !matches {
        return Err(AppError::NotFound("review thread not found"));
    }
    Ok(thread)
}

/// Best-effort: scan recent runs for one whose branch matches the PR head, to
/// reuse that issue's identity for the detail header and Fix-with-AI.
async fn find_run_by_branch(run_repo: &SqliteRunRepo, head_branch: &str) -> Option<Run> {
    if head_branch.trim().is_empty() {
        return None;
    }
    let runs = run_repo.list_recent(200).await.ok()?;
    runs.into_iter()
        .find(|run| run.branch_name.as_deref() == Some(head_branch))
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn storage_or_bad_request(err: anyhow::Error) -> AppError {
    match err.downcast::<superkick_core::CoreError>() {
        Ok(core) => AppError::from(core),
        Err(err) => AppError::Internal(err),
    }
}
