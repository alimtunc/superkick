//! SUP-199 — HTTP contract for local run review state.

use std::sync::Arc;

mod common;
use common::{get_json as get, patch_json as patch, post_json as post, send};

use anyhow::Result;
use axum::http::StatusCode;
use serde_json::json;
use superkick_api::{run_review_test_router, tests_only};
use superkick_core::{ExecutionMode, Run, RunId, TriggerSource};
use superkick_storage::repo::RunRepo;
use superkick_storage::{SqliteDiffReviewRepo, SqliteRunRepo, connect_with_capacity};

async fn router_with_repos() -> (axum::Router, Arc<SqliteRunRepo>, Arc<SqliteDiffReviewRepo>) {
    let pool = connect_with_capacity("sqlite::memory:", 1)
        .await
        .expect("pool");
    let run_repo = Arc::new(SqliteRunRepo::new(pool.clone()));
    let review_repo = Arc::new(SqliteDiffReviewRepo::new(pool));
    let router = run_review_test_router(Arc::clone(&run_repo), Arc::clone(&review_repo));
    (router, run_repo, review_repo)
}

async fn insert_run(repo: &SqliteRunRepo) -> Run {
    let mut run = Run::new(
        "issue-uuid".into(),
        "SUP-199".into(),
        "owner/repo".into(),
        TriggerSource::LaunchTask,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    run.worktree_path = Some("/tmp/superkick-review-run".into());
    run.branch_name = Some("superkick/sup-199-run".into());
    repo.insert(&run).await.expect("insert run");
    run
}

#[tokio::test]
async fn create_list_reply_resolve_and_delete_thread() -> Result<()> {
    let (app, run_repo, _review_repo) = router_with_repos().await;
    let run = insert_run(&run_repo).await;

    let (status, body) = post(
        &app,
        &format!("/runs/{}/review/threads", run.id.0),
        json!({
            "issueId": "mismatched-issue",
            "filePath": "ui/src/App.tsx",
            "side": "new",
            "newLine": 12,
            "newLineEnd": 14,
            "hunkHeader": "@@ -10,2 +10,3 @@",
            "hunkIndex": 0,
            "baseRef": "abc1234",
            "headRef": "def5678",
            "author": "operator",
            "body": "Extract this branch before shipping."
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "body: {body}");
    let thread_id = body["id"].as_str().expect("thread id");
    assert_eq!(body["anchor"]["issueId"], "issue-uuid");
    assert_eq!(body["anchor"]["filePath"], "ui/src/App.tsx");
    assert_eq!(body["anchor"]["newLineEnd"], 14);
    assert_eq!(
        body["comments"][0]["body"],
        "Extract this branch before shipping."
    );

    let (status, body) = post(
        &app,
        &format!("/runs/{}/review/threads/{thread_id}/comments", run.id.0),
        json!({
            "author": "operator",
            "body": "The test should cover the null branch too."
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "body: {body}");
    assert_eq!(body["body"], "The test should cover the null branch too.");

    let (status, body) = get(&app, &format!("/runs/{}/review", run.id.0)).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["unresolvedThreadCount"], 1);
    assert_eq!(body["unresolvedCommentCount"], 2);
    assert_eq!(body["threads"][0]["comments"].as_array().unwrap().len(), 2);

    let (status, body) = patch(
        &app,
        &format!("/runs/{}/review/threads/{thread_id}", run.id.0),
        json!({ "resolved": true }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["state"], "resolved");

    let (status, body) = get(&app, &format!("/runs/{}/review", run.id.0)).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["unresolvedCommentCount"], 0);

    let (status, body) = patch(
        &app,
        &format!("/runs/{}/review/threads/{thread_id}", run.id.0),
        json!({ "resolved": false }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["state"], "open");

    let comment_id = body["comments"][0]["id"].as_str().expect("comment id");
    let (status, body) = patch(
        &app,
        &format!(
            "/runs/{}/review/threads/{thread_id}/comments/{comment_id}",
            run.id.0
        ),
        json!({ "body": "   " }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "body: {body}");
    assert_eq!(body["error"], "review comment body must not be empty");

    let (status, _, body) = send(
        &app,
        "DELETE",
        &format!("/runs/{}/review/threads/{thread_id}", run.id.0),
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT, "body: {body}");
    let (status, body) = get(&app, &format!("/runs/{}/review", run.id.0)).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert!(body["threads"].as_array().unwrap().is_empty());

    Ok(())
}

#[tokio::test]
async fn reviewed_file_state_round_trips() {
    let (app, run_repo, _review_repo) = router_with_repos().await;
    let run = insert_run(&run_repo).await;

    let (status, body) = post(
        &app,
        &format!("/runs/{}/review/files/reviewed", run.id.0),
        json!({
            "issueId": "mismatched-issue",
            "filePath": "crates/superkick-api/src/lib.rs",
            "reviewed": true,
            "reviewer": "operator"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["issueId"], "issue-uuid");
    assert_eq!(body["reviewed"], true);

    let (status, body) = get(&app, &format!("/runs/{}/review", run.id.0)).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(
        body["reviewedFiles"][0]["filePath"],
        "crates/superkick-api/src/lib.rs"
    );
    assert_eq!(body["reviewedFiles"][0]["reviewed"], true);
}

#[test]
fn fix_with_ai_prompt_includes_unresolved_comments_and_guardrails() {
    let run_id = RunId::new();
    let prompt = tests_only::render_fix_with_ai_prompt_for_test(
        "SUP-199",
        run_id,
        Some("superkick/sup-199-run"),
        "abc1234",
        "def5678",
        &[
            tests_only::FixPromptCommentForTest {
                file_path: "ui/src/App.tsx".into(),
                side: "new".into(),
                old_line: None,
                new_line: Some(12),
                old_line_end: None,
                new_line_end: Some(14),
                body: "Extract this branch before shipping.".into(),
            },
            tests_only::FixPromptCommentForTest {
                file_path: "crates/superkick-api/src/lib.rs".into(),
                side: "old".into(),
                old_line: Some(44),
                new_line: None,
                old_line_end: None,
                new_line_end: None,
                body: "This deletion drops the error context.".into(),
            },
        ],
        Some("{\"version\":0,\"task\":{\"status\":\"completed\"}}"),
    );

    assert!(prompt.contains("Address these unresolved local review comments"));
    assert!(prompt.contains("Do not introduce unrelated changes"));
    assert!(prompt.contains("SUP-199"));
    assert!(prompt.contains(&run_id.to_string()));
    assert!(prompt.contains("ui/src/App.tsx"));
    assert!(prompt.contains("new lines 12-14"));
    assert!(prompt.contains("This deletion drops the error context."));
    assert!(prompt.contains("Run context snapshot"));
}
