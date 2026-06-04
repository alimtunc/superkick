//! Thin GitHub adapter — fetches PR state and opens PRs via the `gh` CLI.
//!
//! Stays policy-free: which branch, draft-vs-ready, and whether to push first are
//! decided by the runtime ship service, not here.

use std::path::Path;

use anyhow::{Context, Result, bail};
use serde::Deserialize;
use tokio::process::Command;
use tracing::{debug, info};

use superkick_core::PrState;

/// Raw response from `gh api repos/{owner}/{repo}/pulls/{number}`.
#[derive(Debug, Deserialize)]
struct GhPrResponse {
    state: String,
    draft: bool,
    merged_at: Option<String>,
    title: String,
}

/// Resolved PR state from GitHub.
#[derive(Debug, Clone)]
pub struct GitHubPrState {
    pub state: PrState,
    pub title: String,
    pub merged_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Fetch current PR state from GitHub via `gh api`.
pub async fn fetch_pr_state(repo_slug: &str, pr_number: u32) -> Result<GitHubPrState> {
    let endpoint = format!("repos/{repo_slug}/pulls/{pr_number}");

    debug!(%repo_slug, pr_number, "fetching PR state from GitHub");

    let output = Command::new("gh")
        .args([
            "api",
            &endpoint,
            "--jq",
            "{state: .state, draft: .draft, merged_at: .merged_at, title: .title}",
        ])
        .output()
        .await
        .context("failed to run `gh api`")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("`gh api` failed: {stderr}");
    }

    let raw: GhPrResponse =
        serde_json::from_slice(&output.stdout).context("failed to parse `gh api` response")?;

    let state = match (raw.state.as_str(), raw.draft, raw.merged_at.is_some()) {
        (_, _, true) => PrState::Merged,
        ("closed", _, false) => PrState::Closed,
        ("open", true, _) => PrState::Draft,
        _ => PrState::Open,
    };

    let merged_at = raw
        .merged_at
        .as_deref()
        .map(chrono::DateTime::parse_from_rfc3339)
        .transpose()
        .context("failed to parse merged_at")?
        .map(|dt| dt.to_utc());

    Ok(GitHubPrState {
        state,
        title: raw.title,
        merged_at,
    })
}

/// Verify `gh` is installed and authenticated. Returns an actionable error so the
/// ship modal can tell the operator to run `gh auth login` rather than failing
/// opaquely mid-push.
pub async fn check_gh_auth() -> Result<()> {
    let output = Command::new("gh")
        .args(["auth", "status"])
        .output()
        .await
        .context("`gh` CLI not found — install GitHub CLI and run `gh auth login`")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!(
            "GitHub CLI is not authenticated — run `gh auth login` ({})",
            stderr.trim()
        );
    }
    Ok(())
}

/// Open a pull request for an already-pushed branch via `gh pr create`. Returns
/// the PR URL on success. Runs inside `worktree` so `gh` infers the repo from the
/// `origin` remote (mirrors the proven legacy invocation).
pub async fn create_pr(
    worktree: &Path,
    head: &str,
    base: &str,
    title: &str,
    body: &str,
    draft: bool,
) -> Result<String> {
    let mut args = vec![
        "pr", "create", "--head", head, "--base", base, "--title", title, "--body", body,
    ];
    if draft {
        args.push("--draft");
    }

    debug!(%head, %base, draft, "opening PR via `gh pr create`");

    let output = Command::new("gh")
        .args(&args)
        .current_dir(worktree)
        .output()
        .await
        .context("failed to run `gh pr create`")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("`gh pr create` failed: {}", stderr.trim());
    }

    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if url.is_empty() {
        bail!("`gh pr create` succeeded but produced no URL on stdout");
    }

    info!(pr_url = %url, draft, "PR created");
    Ok(url)
}
