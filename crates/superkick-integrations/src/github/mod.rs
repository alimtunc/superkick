//! Thin GitHub adapter — fetches PR state and opens PRs via the `gh` CLI.
//!
//! Stays policy-free: which branch, draft-vs-ready, and whether to push first are
//! decided by the runtime ship service, not here.

use std::path::Path;

use anyhow::{Context, Result, bail};
use serde::Deserialize;
use tokio::process::Command;
use tracing::{debug, info};

use superkick_core::{GitHubPullRequestRef, PrDiffFile, PrDiffFileStatus, PrState};

/// Raw response from `gh api repos/{owner}/{repo}/pulls/{number}`.
#[derive(Debug, Deserialize)]
struct GhPrResponse {
    state: String,
    draft: bool,
    merged_at: Option<String>,
    title: String,
    html_url: String,
    head_ref: String,
    head_sha: String,
    base_ref: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct GhPrFileResponse {
    filename: String,
    #[serde(default)]
    previous_filename: Option<String>,
    status: String,
    additions: u32,
    deletions: u32,
    #[serde(default)]
    patch: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GhSearchIssueResponse {
    items: Vec<GhSearchIssueItem>,
}

#[derive(Debug, Deserialize)]
struct GhSearchIssueItem {
    html_url: String,
}

/// Resolved PR state from GitHub.
#[derive(Debug, Clone)]
pub struct GitHubPrState {
    pub state: PrState,
    pub title: String,
    pub merged_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Resolved PR metadata from GitHub.
#[derive(Debug, Clone)]
pub struct GitHubPrDetails {
    pub number: u32,
    pub repo_slug: String,
    pub url: String,
    pub state: PrState,
    pub title: String,
    pub head_branch: String,
    pub head_sha: String,
    pub base_branch: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
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
    let details = fetch_pr_details(repo_slug, pr_number).await?;
    Ok(GitHubPrState {
        state: details.state,
        title: details.title,
        merged_at: details.merged_at,
    })
}

/// Fetch current PR metadata from GitHub via `gh api`.
pub async fn fetch_pr_details(repo_slug: &str, pr_number: u32) -> Result<GitHubPrDetails> {
    let endpoint = format!("repos/{repo_slug}/pulls/{pr_number}");

    debug!(%repo_slug, pr_number, "fetching PR details from GitHub");

    let output = run_gh(
        &[
            "api",
            &endpoint,
            "--jq",
            "{state: .state, draft: .draft, merged_at: .merged_at, title: .title, html_url: .html_url, head_ref: .head.ref, head_sha: .head.sha, base_ref: .base.ref, created_at: .created_at, updated_at: .updated_at}",
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

    Ok(GitHubPrDetails {
        number: pr_number,
        repo_slug: repo_slug.to_string(),
        url: raw.html_url,
        state,
        title: raw.title,
        head_branch: raw.head_ref,
        head_sha: raw.head_sha,
        base_branch: raw.base_ref,
        created_at: parse_github_timestamp(&raw.created_at)
            .context("failed to parse created_at")?,
        updated_at: parse_github_timestamp(&raw.updated_at)
            .context("failed to parse updated_at")?,
        merged_at: raw
            .merged_at
            .as_deref()
            .map(parse_github_timestamp)
            .transpose()
            .context("failed to parse merged_at")?,
    })
}

/// Fetch the files in a PR diff. Patches are loaded lazily by callers and can be
/// cached by the PR head SHA.
pub async fn fetch_pr_files(repo_slug: &str, pr_number: u32) -> Result<Vec<PrDiffFile>> {
    let endpoint = format!("repos/{repo_slug}/pulls/{pr_number}/files?per_page=100");

    debug!(%repo_slug, pr_number, "fetching PR files from GitHub");

    let output = run_gh(
        &[
            "api",
            &endpoint,
            "--paginate",
            "--slurp",
            "--jq",
            "flatten | map({filename: .filename, previous_filename: .previous_filename, status: .status, additions: .additions, deletions: .deletions, patch: .patch})",
        ],
        None,
    )
    .await?;

    let raw: Vec<GhPrFileResponse> = serde_json::from_slice(&output.stdout)
        .context("failed to parse `gh api` files response")?;

    raw.into_iter()
        .enumerate()
        .map(|(position, file)| {
            Ok(PrDiffFile {
                path: file.filename,
                old_path: file.previous_filename,
                status: diff_status_from_github(&file.status),
                additions: file.additions,
                deletions: file.deletions,
                patch: file.patch,
                position: u32::try_from(position)?,
            })
        })
        .collect()
}

/// Search a repository for PRs mentioning an issue identifier. This is a
/// bounded fallback for issues that have no Linear GitHub attachment yet.
pub async fn search_prs_by_issue_identifier(
    repo_slug: &str,
    issue_identifier: &str,
    limit: u32,
) -> Result<Vec<GitHubPrDetails>> {
    let query = format!("repo:{repo_slug} is:pr {issue_identifier}");
    let per_page = format!("per_page={}", limit.clamp(1, 20));
    let q = format!("q={query}");

    debug!(%repo_slug, %issue_identifier, "searching GitHub PRs for Linear issue");

    let output = run_gh(&["api", "search/issues", "-f", &q, "-f", &per_page], None).await?;
    let raw: GhSearchIssueResponse =
        serde_json::from_slice(&output.stdout).context("failed to parse GitHub PR search")?;

    let mut prs = Vec::new();
    for reference in raw
        .items
        .into_iter()
        .filter_map(|item| parse_github_pr_reference(&item.html_url))
        .filter(|reference| reference.repo_slug == repo_slug)
    {
        match fetch_pr_details(&reference.repo_slug, reference.number).await {
            Ok(details) => prs.push(details),
            Err(err) => {
                debug!(%repo_slug, pr_number = reference.number, error = %err, "failed to hydrate searched PR")
            }
        }
    }
    Ok(prs)
}

fn parse_github_timestamp(value: &str) -> Result<chrono::DateTime<chrono::Utc>> {
    Ok(chrono::DateTime::parse_from_rfc3339(value)?.to_utc())
}

fn diff_status_from_github(status: &str) -> PrDiffFileStatus {
    match status {
        "added" => PrDiffFileStatus::Added,
        "modified" => PrDiffFileStatus::Modified,
        "removed" => PrDiffFileStatus::Removed,
        "renamed" => PrDiffFileStatus::Renamed,
        "changed" => PrDiffFileStatus::Changed,
        "unchanged" => PrDiffFileStatus::Unchanged,
        _ => PrDiffFileStatus::Changed,
    }
}

fn parse_github_pr_reference(url: &str) -> Option<GitHubPullRequestRef> {
    superkick_core::parse_github_pr_url(url)
}

impl GitHubPrDetails {
    pub fn into_issue_pull_request(
        self,
        issue_id: String,
        issue_identifier: String,
        source: superkick_core::IssuePullRequestSource,
    ) -> superkick_core::IssuePullRequest {
        superkick_core::IssuePullRequest {
            issue_id,
            issue_identifier,
            repo_slug: self.repo_slug,
            number: self.number,
            url: self.url,
            state: self.state,
            title: self.title,
            head_branch: self.head_branch,
            head_sha: self.head_sha,
            base_branch: self.base_branch,
            source,
            created_at: self.created_at,
            updated_at: self.updated_at,
            merged_at: self.merged_at,
            synced_at: chrono::Utc::now(),
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_unknown_github_diff_status_to_changed() {
        assert_eq!(diff_status_from_github("added"), PrDiffFileStatus::Added);
        assert_eq!(diff_status_from_github("copied"), PrDiffFileStatus::Changed);
    }

    #[test]
    fn parses_search_result_pr_reference() {
        let reference =
            parse_github_pr_reference("https://github.com/acme/superkick/pull/42").unwrap();
        assert_eq!(reference.repo_slug, "acme/superkick");
        assert_eq!(reference.number, 42);
    }
}
