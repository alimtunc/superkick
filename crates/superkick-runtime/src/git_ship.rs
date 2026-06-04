//! Shared git operations for publishing a run's worktree branch.
//!
//! Extracted so the autonomous `step_engine::create_pr` step and the on-demand
//! ship service drive the same push/commit/divergence logic instead of
//! copy-pasting it. These are pure git side effects — no event streaming, no PR
//! policy. Callers layer their own observability and PR-mode decisions on top.

use std::path::Path;

use anyhow::{Context, Result, bail};

use crate::git::{git, git_raw};

/// Ensure the worktree has an `origin` remote pointing at the repo, then best-effort
/// fetch the base branch. The fetch is non-fatal: divergence checks fall back to a
/// locally-resolvable ref when offline.
pub async fn ensure_origin_remote(
    worktree: &Path,
    repo_slug: &str,
    base_branch: &str,
) -> Result<()> {
    let clone_url = crate::worktree::github_clone_url(repo_slug);
    let remote_check = git_raw(worktree, &["remote", "get-url", "origin"]).await;
    if !matches!(remote_check, Ok(output) if output.status.success()) {
        git(worktree, &["remote", "add", "origin", &clone_url])
            .await
            .context("failed to add origin remote to worktree")?;
    }
    let _ = git(worktree, &["fetch", "origin", base_branch]).await;
    Ok(())
}

/// Conventional-commit subject shared by both ship paths so it stays identical.
pub fn default_commit_message(issue_identifier: &str) -> String {
    format!("feat({issue_identifier}): implement changes")
}

/// Stage and commit every change in the worktree when it is dirty. Returns whether
/// a commit was actually made so callers can react (e.g. emit an event).
pub async fn commit_all_if_dirty(worktree: &Path, message: &str) -> Result<bool> {
    let status_out = git_raw(worktree, &["status", "--porcelain"])
        .await
        .context("failed to run git status")?;
    let dirty = status_out.status.success()
        && !String::from_utf8_lossy(&status_out.stdout)
            .trim()
            .is_empty();

    if dirty {
        git(worktree, &["add", "-A"])
            .await
            .context("failed to stage changes")?;
        git(worktree, &["commit", "-m", message])
            .await
            .context("failed to commit staged changes")?;
    }
    Ok(dirty)
}

/// Whether `HEAD` has any commits beyond the base branch (i.e. there is something
/// to push). Prefers the remote-tracking `origin/<base>` ref (what the PR diffs
/// against on GitHub), and falls back to the local `<base>` branch when the
/// remote ref was never fetched (offline / unauthenticated dev) — so the check
/// degrades gracefully instead of failing the whole ship.
pub async fn has_commits_against_base(worktree: &Path, base_branch: &str) -> Result<bool> {
    let base_sha = resolve_base_sha(worktree, base_branch).await?;
    let head_sha = git(worktree, &["rev-parse", "HEAD"])
        .await
        .context("failed to get HEAD sha")?;
    Ok(head_sha.trim() != base_sha.trim())
}

/// Resolve the base commit, preferring `origin/<base>` and falling back to the
/// local `<base>` branch. Uses `--verify --quiet` so a missing ref is a skipped
/// candidate rather than a hard error.
async fn resolve_base_sha(worktree: &Path, base_branch: &str) -> Result<String> {
    for rev in [format!("origin/{base_branch}"), base_branch.to_string()] {
        let output = git_raw(worktree, &["rev-parse", "--verify", "--quiet", &rev])
            .await
            .with_context(|| format!("failed to run git rev-parse {rev}"))?;
        if output.status.success() {
            let sha = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !sha.is_empty() {
                return Ok(sha);
            }
        }
    }
    bail!("failed to resolve base sha for origin/{base_branch} or local {base_branch}")
}

/// Push the branch to `origin`, setting upstream tracking.
pub async fn push_branch(worktree: &Path, branch: &str) -> Result<()> {
    git(worktree, &["push", "-u", "origin", branch])
        .await
        .with_context(|| format!("failed to push branch '{branch}' to origin"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::default_commit_message;

    #[test]
    fn default_commit_message_uses_conventional_subject() {
        assert_eq!(
            default_commit_message("SUP-195"),
            "feat(SUP-195): implement changes"
        );
    }
}
