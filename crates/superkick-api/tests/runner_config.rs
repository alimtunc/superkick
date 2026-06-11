//! GET + PUT `/config/runner` against a real temp `superkick.yaml`. Pins:
//!   - GET reads fresh values from disk and reports `requires_restart: false`
//!     when disk matches the boot snapshot;
//!   - PUT normalizes, persists atomically, and flips `requires_restart`;
//!   - an invalid `worktree_prefix` returns 422 and writes nothing.

use std::path::PathBuf;

mod common;
use common::{get_json, send};

use axum::Router;
use axum::http::StatusCode;
use serde_json::json;
use superkick_api::runner_config_test_router;
use superkick_config::RunnerConfig;
use tempfile::TempDir;

fn setup() -> (Router, PathBuf, RunnerConfig, TempDir) {
    let dir = tempfile::tempdir().expect("tempdir");
    let config_path = dir.path().join("superkick.yaml");
    let boot = superkick_config::load_or_bootstrap(&config_path).expect("bootstrap");
    let boot_runner = boot.runner.clone();
    let app = runner_config_test_router(config_path.clone(), boot.runner);
    (app, config_path, boot_runner, dir)
}

#[tokio::test]
async fn get_returns_disk_values_with_no_restart_at_boot_parity() {
    let (app, _config_path, boot_runner, _dir) = setup();

    let (status, body) = get_json(&app, "/config/runner").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["worktree_prefix"], boot_runner.worktree_prefix);
    assert_eq!(body["base_branch"], boot_runner.base_branch);
    assert_eq!(body["setup_commands"], json!(boot_runner.setup_commands));
    assert_eq!(body["requires_restart"], false);
}

#[tokio::test]
async fn put_persists_to_disk_and_flags_restart_when_changed() {
    let (app, config_path, _boot_runner, _dir) = setup();

    let (status, _, body) = send(
        &app,
        "PUT",
        "/config/runner",
        Some(json!({
            "worktree_prefix": "  feature  ",
            "base_branch": " develop ",
            "setup_commands": ["pnpm install", "   ", ""],
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["worktree_prefix"], "feature");
    assert_eq!(body["base_branch"], "develop");
    assert_eq!(body["setup_commands"], json!(["pnpm install"]));
    assert_eq!(body["requires_restart"], true);

    let on_disk = superkick_config::load_file(&config_path).expect("reload");
    assert_eq!(on_disk.runner.worktree_prefix, "feature");
    assert_eq!(on_disk.runner.base_branch, "develop");
    assert_eq!(on_disk.runner.setup_commands, vec!["pnpm install"]);

    let (status, body) = get_json(&app, "/config/runner").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["worktree_prefix"], "feature");
    assert_eq!(body["requires_restart"], true);
}

#[tokio::test]
async fn put_rejects_invalid_prefix_with_422_and_writes_nothing() {
    let (app, config_path, _boot_runner, _dir) = setup();

    let (status, _, body) = send(
        &app,
        "PUT",
        "/config/runner",
        Some(json!({
            "worktree_prefix": "-bad",
            "base_branch": "main",
            "setup_commands": [],
        })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        body["error"],
        "worktree_prefix must not start or end with '.' or '-'"
    );
    assert!(!config_path.exists());

    let (status, body) = get_json(&app, "/config/runner").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["requires_restart"], false);
}
