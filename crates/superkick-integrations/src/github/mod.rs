//! Thin GitHub adapter — fetches PR state via `gh api` CLI.

use anyhow::{Context, Result, bail};
use serde::Deserialize;
use tokio::process::Command;
use tracing::debug;

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
