//! SUP-172 — HTTP smoke tests for `GET /runs/{id}/diff`.
//!
//! Wired through `run_diff_test_router` so the handler runs against a
//! real in-memory SQLite plus a real on-disk git repo. Pins:
//!   - 404 on unknown run id
//!   - 422 when the run is not worktree-backed
//!   - 404 when `worktree_path` was never set
//!   - 404 when `worktree_path` points at a missing directory
//!   - 200 happy-path: file list + per-file unified diff
//!   - 200 empty path: no changes returns an empty file list

use std::fs;
use std::path::Path;
use std::process::Command;
use std::sync::Arc;

mod common;
use common::get_json as get;

use anyhow::Result;
use axum::http::StatusCode;
use superkick_api::run_diff_test_router;
use superkick_core::{ExecutionMode, Run, TriggerSource};
use superkick_storage::SqliteRunRepo;
use superkick_storage::connect;
use superkick_storage::repo::RunRepo;
use tempfile::TempDir;

async fn router_with_repo() -> (axum::Router, Arc<SqliteRunRepo>) {
    let pool = connect("sqlite::memory:").await.expect("pool");
    let repo = Arc::new(SqliteRunRepo::new(pool));
    let router = run_diff_test_router(Arc::clone(&repo), "main".into());
    (router, repo)
}

fn git(cwd: &Path, args: &[&str]) {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .expect("git exec");
    assert!(
        output.status.success(),
        "git {} failed: {}",
        args.join(" "),
        String::from_utf8_lossy(&output.stderr),
    );
}

fn init_worktree() -> TempDir {
    let dir = TempDir::new().expect("tempdir");
    let path = dir.path();
    git(path, &["init", "-b", "main", "--quiet"]);
    git(path, &["config", "user.email", "test@example.com"]);
    git(path, &["config", "user.name", "Test"]);
    git(path, &["config", "commit.gpgsign", "false"]);
    fs::write(path.join("seed.txt"), "seed\n").unwrap();
    git(path, &["add", "seed.txt"]);
    git(path, &["commit", "-m", "seed", "--quiet"]);
    dir
}

async fn insert_run(repo: &SqliteRunRepo, use_worktree: bool, worktree_path: Option<&Path>) -> Run {
    let mut run = Run::new(
        "issue-uuid".into(),
        "SUP-1".into(),
        "owner/repo".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        use_worktree,
        None,
    );
    run.worktree_path = worktree_path.map(|p| p.to_string_lossy().into_owned());
    run.branch_name = Some("alimtunc/sup-1".into());
    repo.insert(&run).await.expect("insert run");
    run
}

#[tokio::test]
async fn unknown_run_returns_404() {
    let (app, _repo) = router_with_repo().await;
    let (status, body) = get(&app, &format!("/runs/{}/diff", uuid::Uuid::new_v4())).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], "run not found");
}

#[tokio::test]
async fn non_worktree_run_returns_422() {
    let (app, repo) = router_with_repo().await;
    let run = insert_run(&repo, false, None).await;
    let (status, body) = get(&app, &format!("/runs/{}/diff", run.id.0)).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(
        body["error"]
            .as_str()
            .is_some_and(|s| s.contains("worktree-only")),
        "error body: {body}"
    );
}

#[tokio::test]
async fn run_without_worktree_path_returns_404() {
    let (app, repo) = router_with_repo().await;
    let run = insert_run(&repo, true, None).await;
    let (status, body) = get(&app, &format!("/runs/{}/diff", run.id.0)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], "worktree");
}

#[tokio::test]
async fn cleaned_up_worktree_returns_404() {
    let (app, repo) = router_with_repo().await;
    let run = insert_run(
        &repo,
        true,
        Some(Path::new("/definitely/not/a/real/worktree")),
    )
    .await;
    let (status, body) = get(&app, &format!("/runs/{}/diff", run.id.0)).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["error"], "worktree");
}

#[tokio::test]
async fn happy_path_returns_diff_payload() -> Result<()> {
    let worktree = init_worktree();
    let path = worktree.path();
    git(path, &["checkout", "-b", "feature", "--quiet"]);
    fs::write(path.join("seed.txt"), "seed\nmore\n")?;
    fs::write(path.join("new.txt"), "fresh\n")?;
    git(path, &["add", "seed.txt", "new.txt"]);
    git(path, &["commit", "-m", "change", "--quiet"]);

    let (app, repo) = router_with_repo().await;
    let run = insert_run(&repo, true, Some(path)).await;

    let (status, body) = get(&app, &format!("/runs/{}/diff", run.id.0)).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");

    assert_eq!(body["run"]["useWorktree"], true);
    assert_eq!(body["run"]["branchName"], "alimtunc/sup-1");

    let files = body["diff"]["files"].as_array().expect("files array");
    assert_eq!(files.len(), 2, "diff body: {body}");

    let paths: Vec<&str> = files.iter().filter_map(|f| f["path"].as_str()).collect();
    assert!(paths.contains(&"seed.txt"));
    assert!(paths.contains(&"new.txt"));

    let new_file = files.iter().find(|f| f["path"] == "new.txt").unwrap();
    assert_eq!(new_file["status"], "added");
    assert!(
        new_file["patch"]
            .as_str()
            .is_some_and(|p| p.contains("+fresh"))
    );
    assert_eq!(new_file["binary"], false);
    assert_eq!(new_file["truncated"], false);

    assert_eq!(body["diff"]["fileCount"], 2);
    assert_eq!(body["diff"]["overflow"], false);
    Ok(())
}

#[tokio::test]
async fn empty_worktree_returns_zero_files() -> Result<()> {
    let worktree = init_worktree();
    let (app, repo) = router_with_repo().await;
    let run = insert_run(&repo, true, Some(worktree.path())).await;

    let (status, body) = get(&app, &format!("/runs/{}/diff", run.id.0)).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["diff"]["files"].as_array().unwrap().len(), 0);
    assert_eq!(body["diff"]["fileCount"], 0);
    Ok(())
}
