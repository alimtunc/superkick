//! SUP-187 — HTTP smoke tests for `GET /launch-tasks/{id}/snapshot`.
//!
//! Wired through `run_context_snapshot_test_router` against real in-memory
//! SQLite repos. Pins:
//!   - 404 on an unknown launch task id
//!   - 200 happy-path: camelCase projection with linked issue/task/run
//!   - secrets in the issue body are redacted in the response
//!   - the derived snapshot is persisted (regenerable cache) on read

use std::sync::Arc;

use anyhow::Result;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::Value;
use superkick_api::run_context_snapshot_test_router;
use superkick_core::{
    ExecutionMode, IssueWorkspaceContext, IssueWorkspaceContextSnapshot, LaunchTask,
    PlanImplementReviewAgents, Run, TriggerSource,
};
use superkick_runtime::test_support::catalog;
use superkick_runtime::{PublishingRunEventRepo, WorkspaceEventBus};
use superkick_storage::repo::{
    IssueWorkspaceContextRepo, LaunchTaskRepo, RunContextSnapshotRepo, RunRepo,
};
use superkick_storage::{
    SqliteAgentSessionRepo, SqliteIssueWorkspaceContextRepo, SqliteLaunchTaskRepo,
    SqliteRunContextSnapshotRepo, SqliteRunEventRepo, SqliteRunRepo, connect,
};
use tower::ServiceExt;

const GITHUB_PAT: &str = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ISSUE_UUID: &str = "issue-uuid-187";

struct Harness {
    app: axum::Router,
    launch_repo: Arc<SqliteLaunchTaskRepo>,
    run_repo: Arc<SqliteRunRepo>,
    workspace_repo: Arc<SqliteIssueWorkspaceContextRepo>,
    snapshot_repo: Arc<SqliteRunContextSnapshotRepo>,
}

async fn harness() -> Result<Harness> {
    let pool = connect("sqlite::memory:").await?;
    let launch_repo = Arc::new(SqliteLaunchTaskRepo::new(pool.clone()));
    let run_repo = Arc::new(SqliteRunRepo::new(pool.clone()));
    let session_repo = Arc::new(SqliteAgentSessionRepo::new(pool.clone()));
    let event_repo = Arc::new(PublishingRunEventRepo::new(
        SqliteRunEventRepo::new(pool.clone()),
        WorkspaceEventBus::new(),
    ));
    let workspace_repo = Arc::new(SqliteIssueWorkspaceContextRepo::new(pool.clone()));
    let snapshot_repo = Arc::new(SqliteRunContextSnapshotRepo::new(pool));

    let app = run_context_snapshot_test_router(
        Arc::clone(&launch_repo),
        Arc::clone(&run_repo),
        session_repo,
        event_repo,
        Arc::clone(&workspace_repo),
        Arc::clone(&snapshot_repo),
    );
    Ok(Harness {
        app,
        launch_repo,
        run_repo,
        workspace_repo,
        snapshot_repo,
    })
}

fn agents() -> PlanImplementReviewAgents {
    PlanImplementReviewAgents {
        planner: "planner".into(),
        coder: "coder".into(),
        reviewer: "reviewer".into(),
    }
}

async fn get(app: &axum::Router, uri: &str) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(uri)
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("send");
    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body")
        .to_bytes();
    let json = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).expect("json")
    };
    (status, json)
}

#[tokio::test]
async fn unknown_launch_task_returns_404() -> Result<()> {
    let h = harness().await?;
    let (status, body) = get(
        &h.app,
        &format!("/launch-tasks/{}/snapshot", uuid::Uuid::new_v4()),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], "launch task not found");
    Ok(())
}

#[tokio::test]
async fn happy_path_returns_redacted_camelcase_snapshot_and_persists() -> Result<()> {
    let h = harness().await?;

    let (task, steps) = LaunchTask::new_with_v1_recipe(ISSUE_UUID, agents(), &catalog())?;
    h.launch_repo.insert_with_steps(&task, &steps).await?;

    let mut run = Run::new(
        ISSUE_UUID.into(),
        "SUP-187".into(),
        "owner/repo".into(),
        TriggerSource::LaunchTask,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    run.worktree_path = Some("/tmp/wt/sup-187".into());
    run.branch_name = Some("alimtunc/sup-187".into());
    h.run_repo.insert(&run).await?;
    h.launch_repo
        .add_step_links(steps[0].id, Some(run.id), None, None)
        .await?;

    let (ctx, excerpts, links) = IssueWorkspaceContext::new(
        IssueWorkspaceContextSnapshot {
            linear_team_key: "SUP".into(),
            linear_issue_identifier: "SUP-187".into(),
            linear_issue_id: ISSUE_UUID.into(),
            snapshot_title: "RunContextSnapshot v0".into(),
            snapshot_body_md: format!("Body with a secret {GITHUB_PAT} inside"),
            snapshot_status_name: "In Progress".into(),
        },
        vec![],
        vec![],
    )?;
    h.workspace_repo
        .insert_with_children(&ctx, &excerpts, &links)
        .await?;

    let (status, body) = get(&h.app, &format!("/launch-tasks/{}/snapshot", task.id.0)).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");

    // Versioned, camelCase, linked issue/task/run.
    assert_eq!(body["version"], 0);
    assert_eq!(body["launchTaskId"], task.id.0.to_string());
    assert_eq!(body["runId"], run.id.0.to_string());
    assert_eq!(body["issue"]["identifier"], "SUP-187");
    assert_eq!(body["issue"]["title"], "RunContextSnapshot v0");
    assert_eq!(body["steps"].as_array().expect("steps").len(), 3);
    assert_eq!(body["worktree"]["runBranch"], "alimtunc/sup-187");
    assert_eq!(body["diffRef"]["runId"], run.id.0.to_string());

    // Redaction: the secret never reaches the wire.
    let excerpt = body["issue"]["bodyExcerpt"].as_str().expect("body excerpt");
    assert!(!excerpt.contains(GITHUB_PAT), "secret leaked: {excerpt}");
    assert!(excerpt.contains("[redacted:github_pat]"));

    // Persistence: the derived snapshot was upserted as the regenerable cache.
    let persisted = h
        .snapshot_repo
        .get_by_launch_task(task.id)
        .await?
        .expect("snapshot persisted on read");
    assert_eq!(persisted.version, 0);
    assert_eq!(persisted.launch_task_id, task.id);
    Ok(())
}
