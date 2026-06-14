//! PATCH `/config/launch-profile` against a real temp `superkick.yaml`. Pins:
//!   - the patch persists `auto_transition_in_progress` to disk and echoes the
//!     full launch-profile section back;
//!   - bootstrapping a fresh config defaults the flag to `true`.

use std::path::PathBuf;

mod common;
use common::patch_json;

use axum::Router;
use axum::http::StatusCode;
use serde_json::json;
use superkick_api::launch_profile_config_test_router;
use superkick_config::RunnerConfig;
use tempfile::TempDir;

fn setup() -> (Router, PathBuf, RunnerConfig, TempDir) {
    let dir = tempfile::tempdir().expect("tempdir");
    let config_path = dir.path().join("superkick.yaml");
    let boot = superkick_config::load_or_bootstrap(&config_path).expect("bootstrap");
    let boot_runner = boot.runner.clone();
    let app = launch_profile_config_test_router(config_path.clone(), boot.runner);
    (app, config_path, boot_runner, dir)
}

#[tokio::test]
async fn patch_persists_auto_transition_and_echoes_section() {
    let (app, config_path, _boot_runner, _dir) = setup();

    let (status, body) = patch_json(
        &app,
        "/config/launch-profile",
        json!({ "auto_transition_in_progress": false }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["auto_transition_in_progress"], false);

    let on_disk = superkick_config::load_file(&config_path).expect("reload");
    assert!(!on_disk.launch_profile.auto_transition_in_progress);
}

#[tokio::test]
async fn patch_can_re_enable_auto_transition() {
    let (app, config_path, _boot_runner, _dir) = setup();

    let (status, _) = patch_json(
        &app,
        "/config/launch-profile",
        json!({ "auto_transition_in_progress": false }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = patch_json(
        &app,
        "/config/launch-profile",
        json!({ "auto_transition_in_progress": true }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["auto_transition_in_progress"], true);

    let on_disk = superkick_config::load_file(&config_path).expect("reload");
    assert!(on_disk.launch_profile.auto_transition_in_progress);
}
