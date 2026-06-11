//! SUP-199 — local inline diff review state for runs.
//!
//! This is intentionally local-first: the endpoints persist operator review
//! threads against a run diff and do not submit or import GitHub reviews.

use std::sync::Arc;

use axum::extract::{FromRef, Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::{Deserialize, Serialize};

use superkick_core::{
    DiffReviewAnchor, DiffReviewComment, DiffReviewCommentId, DiffReviewFileReviewedChange,
    DiffReviewFileState, DiffReviewLineSide, DiffReviewState, DiffReviewThread, DiffReviewThreadId,
    ExecutionMode, NewDiffReviewComment, NewDiffReviewThread, Run, RunContextSnapshot, RunId,
    render_diff_review_fix_prompt, unresolved_diff_review_fix_prompt_comments,
};
use superkick_runtime::refresh_run_context_snapshot;
use superkick_storage::repo::{DiffReviewRepo, LaunchTaskRepo, RunRepo};
use superkick_storage::{SqliteDiffReviewRepo, SqliteRunRepo};

use crate::AppState;
use crate::error::AppError;
use crate::handlers::runs::{CreateRunRequest, spawn_run_from_request};

#[derive(Clone)]
pub struct RunReviewState {
    pub run_repo: Arc<SqliteRunRepo>,
    pub review_repo: Arc<SqliteDiffReviewRepo>,
}

impl FromRef<AppState> for RunReviewState {
    fn from_ref(state: &AppState) -> Self {
        Self {
            run_repo: Arc::clone(&state.run_repo),
            review_repo: Arc::clone(&state.review_repo),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateThreadRequest {
    pub file_path: String,
    pub old_path: Option<String>,
    pub side: DiffReviewLineSide,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    pub hunk_header: Option<String>,
    pub hunk_index: Option<u32>,
    pub base_ref: Option<String>,
    pub head_ref: Option<String>,
    pub author: Option<String>,
    pub body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCommentRequest {
    pub author: Option<String>,
    pub body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchThreadRequest {
    pub resolved: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchCommentRequest {
    pub body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetFileReviewedRequest {
    pub file_path: String,
    pub old_path: Option<String>,
    pub reviewed: bool,
    pub reviewer: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FixWithAiResponse {
    pub run: Run,
    pub unresolved_comment_count: u32,
}

pub async fn get_run_review(
    State(state): State<RunReviewState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<DiffReviewState>, AppError> {
    let run_id = RunId(id);
    require_run_in_state(&state, run_id).await?;
    Ok(Json(state.review_repo.list_by_run(run_id).await?))
}

pub async fn create_thread(
    State(state): State<RunReviewState>,
    Path(id): Path<uuid::Uuid>,
    Json(body): Json<CreateThreadRequest>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);
    let run = require_run_in_state(&state, run_id).await?;
    let thread = state
        .review_repo
        .create_thread(NewDiffReviewThread {
            anchor: DiffReviewAnchor {
                run_id,
                issue_id: Some(run.issue_id),
                file_path: body.file_path,
                old_path: normalize_optional(body.old_path),
                side: body.side,
                old_line: body.old_line,
                new_line: body.new_line,
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
    State(state): State<RunReviewState>,
    Path((id, thread_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(body): Json<CreateCommentRequest>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);
    let thread_id = DiffReviewThreadId(thread_id);
    require_run_in_state(&state, run_id).await?;
    require_thread_for_run(&state, run_id, thread_id).await?;
    let comment = state
        .review_repo
        .add_comment(
            thread_id,
            NewDiffReviewComment {
                author: body.author,
                body: body.body,
            },
        )
        .await
        .map_err(storage_or_bad_request)?;
    Ok((StatusCode::CREATED, Json(comment)))
}

pub async fn patch_thread(
    State(state): State<RunReviewState>,
    Path((id, thread_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(body): Json<PatchThreadRequest>,
) -> Result<Json<DiffReviewThread>, AppError> {
    let run_id = RunId(id);
    let thread_id = DiffReviewThreadId(thread_id);
    require_run_in_state(&state, run_id).await?;
    require_thread_for_run(&state, run_id, thread_id).await?;
    let thread = state
        .review_repo
        .set_thread_resolved(thread_id, body.resolved)
        .await?
        .ok_or(AppError::NotFound("review thread not found"))?;
    Ok(Json(thread))
}

pub async fn delete_thread(
    State(state): State<RunReviewState>,
    Path((id, thread_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<StatusCode, AppError> {
    let run_id = RunId(id);
    let thread_id = DiffReviewThreadId(thread_id);
    require_run_in_state(&state, run_id).await?;
    require_thread_for_run(&state, run_id, thread_id).await?;
    if !state.review_repo.delete_thread(thread_id).await? {
        return Err(AppError::NotFound("review thread not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn patch_comment(
    State(state): State<RunReviewState>,
    Path((id, thread_id, comment_id)): Path<(uuid::Uuid, uuid::Uuid, uuid::Uuid)>,
    Json(body): Json<PatchCommentRequest>,
) -> Result<Json<DiffReviewComment>, AppError> {
    let run_id = RunId(id);
    let thread_id = DiffReviewThreadId(thread_id);
    let comment_id = DiffReviewCommentId(comment_id);
    require_run_in_state(&state, run_id).await?;
    let thread = require_thread_for_run(&state, run_id, thread_id).await?;
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
    State(state): State<RunReviewState>,
    Path((id, thread_id, comment_id)): Path<(uuid::Uuid, uuid::Uuid, uuid::Uuid)>,
) -> Result<StatusCode, AppError> {
    let run_id = RunId(id);
    let thread_id = DiffReviewThreadId(thread_id);
    let comment_id = DiffReviewCommentId(comment_id);
    require_run_in_state(&state, run_id).await?;
    let thread = require_thread_for_run(&state, run_id, thread_id).await?;
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
    State(state): State<RunReviewState>,
    Path(id): Path<uuid::Uuid>,
    Json(body): Json<SetFileReviewedRequest>,
) -> Result<Json<DiffReviewFileState>, AppError> {
    let run_id = RunId(id);
    let run = require_run_in_state(&state, run_id).await?;
    let reviewed = state
        .review_repo
        .set_file_reviewed(DiffReviewFileReviewedChange {
            run_id,
            issue_id: Some(run.issue_id),
            file_path: body.file_path,
            old_path: normalize_optional(body.old_path),
            reviewed: body.reviewed,
            reviewer: body.reviewer,
        })
        .await
        .map_err(storage_or_bad_request)?;
    Ok(Json(reviewed))
}

pub async fn fix_with_ai(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<FixWithAiResponse>, AppError> {
    let run_id = RunId(id);
    let run = super::require_run(&state, run_id).await?;
    let review = state.review_repo.list_by_run(run_id).await?;
    let comments = unresolved_diff_review_fix_prompt_comments(&review);
    if comments.is_empty() {
        return Err(AppError::Unprocessable(
            "no unresolved review comments to fix".into(),
        ));
    }

    let first_open_thread = review
        .threads
        .iter()
        .find(|thread| thread.state == superkick_core::DiffReviewThreadState::Open);
    let base_ref = first_open_thread
        .and_then(|thread| thread.anchor.base_ref.as_deref())
        .unwrap_or("unknown");
    let head_ref = first_open_thread
        .and_then(|thread| thread.anchor.head_ref.as_deref())
        .unwrap_or("unknown");
    let source_branch = run
        .branch_name
        .clone()
        .filter(|branch| !branch.trim().is_empty())
        .ok_or_else(|| {
            AppError::Unprocessable("fix with ai requires a reviewed source branch".into())
        })?;
    let snapshot = render_run_context_snapshot_for_prompt(&state, run_id).await?;
    let snapshot_json = snapshot.as_deref();
    let prompt = render_diff_review_fix_prompt(
        &run.issue_identifier,
        run_id,
        Some(source_branch.as_str()),
        base_ref,
        head_ref,
        &comments,
        snapshot_json,
    );
    let new_run = spawn_run_from_request(
        &state,
        CreateRunRequest {
            repo_slug: run.repo_slug,
            issue_id: run.issue_id,
            issue_identifier: run.issue_identifier,
            base_branch: Some(source_branch),
            use_worktree: Some(true),
            execution_mode: ExecutionMode::FullAuto,
            operator_instructions: Some(prompt),
            planner_agent: None,
            coder_agent: None,
            reviewer_agent: None,
        },
    )
    .await?;

    Ok(Json(FixWithAiResponse {
        run: new_run,
        unresolved_comment_count: review.unresolved_comment_count,
    }))
}

async fn require_run_in_state(state: &RunReviewState, run_id: RunId) -> Result<Run, AppError> {
    state
        .run_repo
        .get(run_id)
        .await?
        .ok_or(AppError::NotFound("run not found"))
}

async fn require_thread_for_run(
    state: &RunReviewState,
    run_id: RunId,
    thread_id: DiffReviewThreadId,
) -> Result<DiffReviewThread, AppError> {
    let thread = state
        .review_repo
        .get_thread(thread_id)
        .await?
        .ok_or(AppError::NotFound("review thread not found"))?;
    if thread.anchor.run_id != run_id {
        return Err(AppError::NotFound("review thread not found"));
    }
    Ok(thread)
}

async fn render_run_context_snapshot_for_prompt(
    state: &AppState,
    run_id: RunId,
) -> Result<Option<String>, AppError> {
    let Some(step) = state
        .launch_task_repo
        .find_step_by_linked_run(run_id)
        .await?
    else {
        return Ok(None);
    };
    let snapshot = refresh_run_context_snapshot(
        state.launch_task_repo.as_ref(),
        state.run_repo.as_ref(),
        state.session_repo.as_ref(),
        state.event_repo.as_ref(),
        state.issue_workspace_context_repo.as_ref(),
        state.run_context_snapshot_repo.as_ref(),
        step.launch_task_id,
        chrono::Utc::now(),
    )
    .await?;
    Ok(Some(snapshot_to_pretty_json(&snapshot)?))
}

fn snapshot_to_pretty_json(snapshot: &RunContextSnapshot) -> Result<String, AppError> {
    serde_json::to_string_pretty(snapshot).map_err(|err| AppError::Internal(err.into()))
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
