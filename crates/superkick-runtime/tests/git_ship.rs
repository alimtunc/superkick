//! Integration tests for the shared `git_ship` branch-publish helpers.
//!
//! Each case spins a real on-disk git repo (and, where divergence/push matter, a
//! bare origin) so the helpers run against the same `git` CLI they use in
//! production. The `gh`-dependent PR creation is exercised by manual dogfood, not
//! here — these cover the pure-git half of the ship flow.

use std::fs;
use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result};
use superkick_runtime::git_ship;
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

fn head_sha(cwd: &Path) -> String {
    let output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(cwd)
        .output()
        .expect("rev-parse");
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

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

fn bare_origin() -> Result<TempDir> {
    let dir = TempDir::new().context("bare tempdir")?;
    git(dir.path(), &["init", "--bare", "-b", "main", "--quiet"]);
    Ok(dir)
}

#[tokio::test]
async fn commit_all_if_dirty_commits_then_noops_when_clean() -> Result<()> {
    let repo = init_repo()?;
    let path = repo.path();
    let before = head_sha(path);

    // Clean tree → no commit, returns false.
    assert!(!git_ship::commit_all_if_dirty(path, "msg").await?);
    assert_eq!(before, head_sha(path));

    // Dirty tree → commits, returns true.
    fs::write(path.join("new.txt"), "x\n")?;
    assert!(git_ship::commit_all_if_dirty(path, "feat: add new").await?);
    assert_ne!(before, head_sha(path));

    // Clean again → no-op.
    assert!(!git_ship::commit_all_if_dirty(path, "msg").await?);
    Ok(())
}

#[tokio::test]
async fn has_commits_against_base_reflects_divergence() -> Result<()> {
    let origin = bare_origin()?;
    let repo = init_repo()?;
    let path = repo.path();
    git(
        path,
        &["remote", "add", "origin", origin.path().to_str().unwrap()],
    );
    git(path, &["push", "-u", "origin", "main", "--quiet"]);

    // At the base → nothing to ship.
    assert!(!git_ship::has_commits_against_base(path, "main").await?);

    // A new local commit → diverged from origin/main.
    fs::write(path.join("f.txt"), "y\n")?;
    git(path, &["add", "f.txt"]);
    git(path, &["commit", "-m", "more", "--quiet"]);
    assert!(git_ship::has_commits_against_base(path, "main").await?);
    Ok(())
}

#[tokio::test]
async fn has_commits_against_base_falls_back_to_local_base_without_origin() -> Result<()> {
    // No origin remote at all: `origin/main` cannot resolve, so the check must
    // fall back to the local `main` ref instead of erroring (the bug behind the
    // 500 on ship in offline/unauthenticated dev).
    let repo = init_repo()?;
    let path = repo.path();

    assert!(!git_ship::has_commits_against_base(path, "main").await?);

    git(path, &["checkout", "-b", "feat/y", "--quiet"]);
    fs::write(path.join("g.txt"), "z\n")?;
    git(path, &["add", "g.txt"]);
    git(path, &["commit", "-m", "work", "--quiet"]);
    assert!(git_ship::has_commits_against_base(path, "main").await?);
    Ok(())
}

#[tokio::test]
async fn push_branch_publishes_to_origin() -> Result<()> {
    let origin = bare_origin()?;
    let repo = init_repo()?;
    let path = repo.path();
    git(
        path,
        &["remote", "add", "origin", origin.path().to_str().unwrap()],
    );
    git(path, &["checkout", "-b", "feat/x", "--quiet"]);
    fs::write(path.join("f.txt"), "y\n")?;
    git(path, &["add", "f.txt"]);
    git(path, &["commit", "-m", "feat", "--quiet"]);

    git_ship::push_branch(path, "feat/x").await?;

    let listed = Command::new("git")
        .args(["branch", "--list", "feat/x"])
        .current_dir(origin.path())
        .output()
        .expect("branch list");
    assert!(String::from_utf8_lossy(&listed.stdout).contains("feat/x"));
    Ok(())
}
