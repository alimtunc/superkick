use std::path::PathBuf;

use indoc::indoc;
use superkick_config::{
    RunnerPatch, RunnerPatchError, load_file, load_str, save_file, update_runner_config,
};
use tempfile::TempDir;

const BASE_YAML: &str = indoc! {"
    version: 1
    issue_source:
      provider: linear
      trigger: in_progress
    runner:
      mode: local
      repo_root: .
      base_branch: main
      worktree_prefix: superkick
    workflow:
      steps:
        - type: pr
"};

fn config_path(dir: &TempDir) -> PathBuf {
    dir.path().join("superkick.yaml")
}

fn patch(worktree_prefix: &str, base_branch: &str) -> RunnerPatch {
    RunnerPatch {
        worktree_prefix: worktree_prefix.into(),
        base_branch: base_branch.into(),
        setup_commands: Vec::new(),
    }
}

fn assert_invalid(applied: RunnerPatch, needle: &str) {
    let dir = TempDir::new().unwrap();
    let path = config_path(&dir);
    let err = update_runner_config(&path, applied).unwrap_err();
    match err {
        RunnerPatchError::Invalid(message) => assert!(
            message.contains(needle),
            "expected message containing {needle:?}, got: {message}"
        ),
        other => panic!("expected Invalid, got {other:?}"),
    }
    assert!(!path.exists(), "rejected patch must not write the file");
}

#[test]
fn save_file_round_trips_runner_fields() {
    let dir = TempDir::new().unwrap();
    let path = config_path(&dir);
    let mut config = load_str(BASE_YAML).unwrap();
    config.runner.worktree_prefix = "feature".into();
    config.runner.base_branch = "develop".into();
    config.runner.setup_commands = vec!["pnpm install".into(), "just check".into()];

    save_file(&config, &path).unwrap();
    let loaded = load_file(&path).unwrap();

    assert_eq!(loaded.runner, config.runner);
}

#[test]
fn update_runner_config_persists_normalized_patch() {
    let dir = TempDir::new().unwrap();
    let path = config_path(&dir);
    save_file(&load_str(BASE_YAML).unwrap(), &path).unwrap();

    let runner = update_runner_config(
        &path,
        RunnerPatch {
            worktree_prefix: "  feature-x  ".into(),
            base_branch: " develop ".into(),
            setup_commands: vec!["  pnpm install ".into(), "   ".into(), String::new()],
        },
    )
    .unwrap();

    assert_eq!(runner.worktree_prefix, "feature-x");
    assert_eq!(runner.base_branch, "develop");
    assert_eq!(runner.setup_commands, vec!["pnpm install".to_string()]);

    let on_disk = load_file(&path).unwrap();
    assert_eq!(on_disk.runner, runner);
}

#[test]
fn update_runner_config_bootstraps_missing_file() {
    let dir = TempDir::new().unwrap();
    let path = config_path(&dir);
    assert!(!path.exists());

    let runner = update_runner_config(&path, patch("feature", "main")).unwrap();

    assert!(path.exists(), "bootstrap must create the config file");
    assert_eq!(runner.worktree_prefix, "feature");
    assert_eq!(runner.base_branch, "main");
    let loaded = load_file(&path).unwrap();
    assert_eq!(loaded.runner, runner);
}

#[test]
fn reject_empty_worktree_prefix() {
    assert_invalid(patch("   ", "main"), "worktree_prefix must not be empty");
}

#[test]
fn reject_overlong_worktree_prefix() {
    assert_invalid(
        patch(&"a".repeat(41), "main"),
        "worktree_prefix must be at most 40 characters",
    );
}

#[test]
fn reject_worktree_prefix_with_invalid_characters() {
    assert_invalid(
        patch("Feature/Branch", "main"),
        "worktree_prefix may only contain",
    );
}

#[test]
fn reject_worktree_prefix_with_leading_dash() {
    assert_invalid(
        patch("-feature", "main"),
        "must not start or end with '.' or '-'",
    );
}

#[test]
fn reject_worktree_prefix_with_trailing_dot() {
    assert_invalid(
        patch("feature.", "main"),
        "must not start or end with '.' or '-'",
    );
}

#[test]
fn reject_empty_base_branch() {
    assert_invalid(patch("feature", "   "), "base_branch must not be empty");
}

#[test]
fn accept_worktree_prefix_at_max_length_with_full_charset() {
    let dir = TempDir::new().unwrap();
    let path = config_path(&dir);
    let prefix = format!("_a.b-c_{}", "0".repeat(33));
    assert_eq!(prefix.chars().count(), 40);

    let runner = update_runner_config(&path, patch(&prefix, "main")).unwrap();

    assert_eq!(runner.worktree_prefix, prefix);
}
