//! HTTP tests for `GET /issues/{id}/reusable-worktree`.
//!
//! Wired through `reusable_worktree_test_router` against a real in-memory
//! SQLite plus real on-disk worktree directories. Pins:
//!   - 200 with { run_id, worktree_path, branch_name } when a finished,
//!     worktree-backed run still has its directory on disk;
//!   - 404 when the only finished run's directory has been cleaned up;
//!   - 404 when the issue has an active run (reuse would collide);
//!   - 404 when the issue has no runs at all.

use std::path::Path;
use std::sync::Arc;

mod common;
use common::get_json as get;

use axum::http::StatusCode;
use superkick_api::reusable_worktree_test_router;
use superkick_core::{ExecutionMode, Run, RunState, TriggerSource};
use superkick_storage::SqliteRunRepo;
use superkick_storage::connect;
use superkick_storage::repo::RunRepo;
use tempfile::TempDir;

async fn router_with_repo() -> (axum::Router, Arc<SqliteRunRepo>) {
    let pool = connect("sqlite::memory:").await.expect("pool");
    let repo = Arc::new(SqliteRunRepo::new(pool));
    let router = reusable_worktree_test_router(Arc::clone(&repo));
    (router, repo)
}

async fn insert_run(
    repo: &SqliteRunRepo,
    identifier: &str,
    state: RunState,
    use_worktree: bool,
    worktree_path: Option<&Path>,
) -> Run {
    let mut run = Run::new(
        "issue-uuid".into(),
        identifier.into(),
        "owner/repo".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        use_worktree,
        None,
    );
    run.state = state;
    run.worktree_path = worktree_path.map(|p| p.to_string_lossy().into_owned());
    run.branch_name = Some("alimtunc/sup-1".into());
    repo.insert(&run).await.expect("insert run");
    run
}

#[tokio::test]
async fn returns_200_with_surviving_finished_worktree() {
    let worktree = TempDir::new().expect("tempdir");
    let (app, repo) = router_with_repo().await;
    let run = insert_run(
        &repo,
        "SUP-1",
        RunState::Completed,
        true,
        Some(worktree.path()),
    )
    .await;

    let (status, body) = get(&app, "/issues/SUP-1/reusable-worktree").await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["run_id"], run.id.0.to_string());
    assert_eq!(
        body["worktree_path"],
        worktree.path().to_string_lossy().as_ref()
    );
    assert_eq!(body["branch_name"], "alimtunc/sup-1");
}

#[tokio::test]
async fn returns_404_when_worktree_directory_is_gone() {
    let (app, repo) = router_with_repo().await;
    insert_run(
        &repo,
        "SUP-1",
        RunState::Completed,
        true,
        Some(Path::new("/definitely/not/a/real/worktree")),
    )
    .await;

    let (status, body) = get(&app, "/issues/SUP-1/reusable-worktree").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], "no reusable worktree for issue");
}

#[tokio::test]
async fn returns_404_when_issue_has_active_run() {
    let worktree = TempDir::new().expect("tempdir");
    let (app, repo) = router_with_repo().await;
    insert_run(
        &repo,
        "SUP-1",
        RunState::Completed,
        true,
        Some(worktree.path()),
    )
    .await;
    insert_run(
        &repo,
        "SUP-1",
        RunState::Coding,
        true,
        Some(worktree.path()),
    )
    .await;

    let (status, body) = get(&app, "/issues/SUP-1/reusable-worktree").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], "no reusable worktree for issue");
}

#[tokio::test]
async fn returns_404_when_issue_has_no_runs() {
    let (app, _repo) = router_with_repo().await;
    let (status, body) = get(&app, "/issues/SUP-404/reusable-worktree").await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], "no reusable worktree for issue");
}
