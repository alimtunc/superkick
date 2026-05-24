//! SUP-172 — integration tests for `collect_run_diff`.
//!
//! These spin a real on-disk git repo per case (via `tempfile::TempDir`)
//! and exercise the collector through the same `git` CLI it uses in
//! production. Mocking git would mask the parser/integration bugs these
//! tests exist to catch.

use std::fs;
use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result};
use superkick_core::FileDiffStatus;
use superkick_runtime::{DiffError, collect_run_diff};
use tempfile::TempDir;

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

/// Init a repo on `main` with deterministic identity + a seed commit so
/// every test starts from a known base.
fn init_repo() -> Result<TempDir> {
    let dir = TempDir::new().context("tempdir")?;
    let path = dir.path();
    git(path, &["init", "-b", "main", "--quiet"]);
    git(path, &["config", "user.email", "test@example.com"]);
    git(path, &["config", "user.name", "Test"]);
    git(path, &["config", "commit.gpgsign", "false"]);
    fs::write(path.join("seed.txt"), "seed\n")?;
    git(path, &["add", "seed.txt"]);
    git(path, &["commit", "-m", "seed", "--quiet"]);
    Ok(dir)
}

#[tokio::test]
async fn missing_worktree_returns_worktree_missing() {
    let result = collect_run_diff(Path::new("/definitely/not/a/real/path"), "main").await;
    assert!(matches!(result, Err(DiffError::WorktreeMissing)));
}

#[tokio::test]
async fn non_git_dir_returns_worktree_missing() {
    let dir = TempDir::new().unwrap();
    let result = collect_run_diff(dir.path(), "main").await;
    assert!(matches!(result, Err(DiffError::WorktreeMissing)));
}

#[tokio::test]
async fn no_changes_returns_empty_diff() -> Result<()> {
    let repo = init_repo()?;
    let diff = collect_run_diff(repo.path(), "main").await?;
    assert!(
        diff.files.is_empty(),
        "expected no files, got {:?}",
        diff.files
    );
    assert_eq!(diff.file_count, 0);
    assert!(!diff.overflow);
    Ok(())
}

#[tokio::test]
async fn modified_and_added_files_appear_with_correct_status() -> Result<()> {
    let repo = init_repo()?;
    let path = repo.path();

    // Branch off main, modify the seed file, and add a new tracked file.
    git(path, &["checkout", "-b", "feature", "--quiet"]);
    fs::write(path.join("seed.txt"), "seed\nmore\n")?;
    fs::write(path.join("new.txt"), "fresh content\n")?;
    git(path, &["add", "seed.txt", "new.txt"]);
    git(path, &["commit", "-m", "change", "--quiet"]);

    let diff = collect_run_diff(path, "main").await?;

    assert_eq!(diff.file_count, 2, "files: {:?}", diff.files);
    assert!(!diff.overflow);

    let by_path: std::collections::HashMap<_, _> =
        diff.files.iter().map(|f| (f.path.clone(), f)).collect();

    let seed = by_path.get("seed.txt").expect("seed.txt in diff");
    assert_eq!(seed.status, FileDiffStatus::Modified);
    assert_eq!(seed.additions, 1);
    assert_eq!(seed.deletions, 0);
    assert!(!seed.binary);
    assert!(seed.patch.as_ref().is_some_and(|p| p.contains("+more")));

    let new = by_path.get("new.txt").expect("new.txt in diff");
    assert_eq!(new.status, FileDiffStatus::Added);
    assert_eq!(new.additions, 1);
    assert!(
        new.patch
            .as_ref()
            .is_some_and(|p| p.contains("+fresh content"))
    );

    Ok(())
}

#[tokio::test]
async fn untracked_file_reported_as_untracked() -> Result<()> {
    let repo = init_repo()?;
    let path = repo.path();
    fs::write(path.join("scratch.txt"), "line one\nline two\n")?;
    // Deliberately no `git add` — this is the "agent created a file but
    // didn't stage it" case the V1 viewer cares about.

    let diff = collect_run_diff(path, "main").await?;

    let scratch = diff
        .files
        .iter()
        .find(|f| f.path == "scratch.txt")
        .expect("scratch.txt should be in diff");
    assert_eq!(scratch.status, FileDiffStatus::Untracked);
    assert_eq!(scratch.additions, 2);
    assert_eq!(scratch.deletions, 0);
    assert!(!scratch.binary);
    let patch = scratch
        .patch
        .as_ref()
        .expect("untracked file has synthesized patch");
    assert!(patch.contains("--- /dev/null"));
    assert!(patch.contains("+line one"));
    assert!(patch.contains("+line two"));

    Ok(())
}

#[tokio::test]
async fn deleted_file_reported_as_deleted() -> Result<()> {
    let repo = init_repo()?;
    let path = repo.path();
    git(path, &["checkout", "-b", "feature", "--quiet"]);
    fs::remove_file(path.join("seed.txt"))?;
    git(path, &["add", "-A"]);
    git(path, &["commit", "-m", "remove seed", "--quiet"]);

    let diff = collect_run_diff(path, "main").await?;

    let seed = diff
        .files
        .iter()
        .find(|f| f.path == "seed.txt")
        .expect("seed.txt should appear as deleted");
    assert_eq!(seed.status, FileDiffStatus::Deleted);
    Ok(())
}

#[tokio::test]
async fn falls_back_to_empty_tree_on_single_commit_repo() -> Result<()> {
    // `init_repo` already gives one commit and no parent. Add an
    // unstaged change so there's something to diff once the fallback
    // resolves the base to the empty-tree SHA.
    let repo = init_repo()?;
    let path = repo.path();
    fs::write(path.join("extra.txt"), "data\n")?;

    let diff = collect_run_diff(path, "nonexistent-base-branch").await?;

    assert!(
        diff.files.iter().any(|f| f.path == "extra.txt"),
        "extra.txt should still appear when the named base branch is unknown: {:?}",
        diff.files
    );
    Ok(())
}

#[tokio::test]
async fn base_and_head_refs_populated() -> Result<()> {
    let repo = init_repo()?;
    let path = repo.path();
    git(path, &["checkout", "-b", "feature", "--quiet"]);
    fs::write(path.join("seed.txt"), "seed\nmore\n")?;
    git(path, &["add", "seed.txt"]);
    git(path, &["commit", "-m", "tweak", "--quiet"]);

    let diff = collect_run_diff(path, "main").await?;

    // Both refs should be non-empty short shas and they should differ
    // (HEAD has moved past the merge-base).
    assert!(!diff.base_ref.is_empty());
    assert!(!diff.head_ref.is_empty());
    assert_ne!(diff.base_ref, diff.head_ref);
    Ok(())
}
