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

/// Run a `gh` invocation, mapping spawn failure and non-zero exit to errors.
/// Callers attach their own operator-facing guidance via `.context()`.
async fn run_gh(args: &[&str], cwd: Option<&Path>) -> Result<std::process::Output> {
    let mut cmd = Command::new("gh");
    cmd.args(args);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let output = cmd
        .output()
        .await
        .with_context(|| format!("failed to run `gh {}`", args.first().unwrap_or(&"")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("`gh {}` failed: {}", args.join(" "), stderr.trim());
    }
    Ok(output)
}

/// Fetch current PR state from GitHub via `gh api`.
pub async fn fetch_pr_state(repo_slug: &str, pr_number: u32) -> Result<GitHubPrState> {
    let endpoint = format!("repos/{repo_slug}/pulls/{pr_number}");

    debug!(%repo_slug, pr_number, "fetching PR state from GitHub");

    let output = run_gh(
        &[
            "api",
            &endpoint,
            "--jq",
            "{state: .state, draft: .draft, merged_at: .merged_at, title: .title}",
        ],
        None,
    )
    .await?;

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
    run_gh(&["auth", "status"], None).await.map_err(|err| {
        match err.downcast_ref::<std::io::Error>() {
            Some(_) => {
                err.context("`gh` CLI not found — install GitHub CLI and run `gh auth login`")
            }
            None => err.context("GitHub CLI is not authenticated — run `gh auth login`"),
        }
    })?;
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

    let output = run_gh(&args, Some(worktree)).await?;

    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if url.is_empty() {
        bail!("`gh pr create` succeeded but produced no URL on stdout");
    }

    info!(pr_url = %url, draft, "PR created");
    Ok(url)
}
