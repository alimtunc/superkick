//! Thin GitHub adapter — fetches PR state and opens PRs via the `gh` CLI.
//!
//! Stays policy-free: which branch, draft-vs-ready, and whether to push first are
//! decided by the runtime ship service, not here.

use std::path::Path;

use anyhow::{Context, Result, bail};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tracing::{debug, info};

use superkick_core::{
    GitHubPullRequestRef, GithubReviewDecision, PrChecksSummary, PrDiffFile, PrDiffFileStatus,
    PrState,
};

/// JSON fields requested from `gh pr list` / `gh pr view` for the review inbox.
const PR_SUMMARY_JSON_FIELDS: &str = "number,title,url,state,isDraft,author,headRefName,baseRefName,headRefOid,reviewDecision,reviewRequests,latestReviews,body,statusCheckRollup,createdAt,updatedAt";

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

    // gh >= 2.94 rejects `--slurp` combined with `--jq`; slurp alone returns one
    // JSON array per page, flattened here instead.
    let output = run_gh(&["api", &endpoint, "--paginate", "--slurp"], None).await?;

    let pages: Vec<Vec<GhPrFileResponse>> = serde_json::from_slice(&output.stdout)
        .context("failed to parse `gh api` files response")?;

    pages
        .into_iter()
        .flatten()
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

// --- SUP-205: PR review inbox, activity, and review submission ---------------

/// A PR summary for the `/reviews` inbox/detail. Thin: the runtime owns bucket
/// classification and viewer identity, this layer just surfaces GitHub fields.
#[derive(Debug, Clone)]
pub struct GitHubPrSummary {
    pub number: u32,
    pub title: String,
    pub url: String,
    pub state: PrState,
    pub is_draft: bool,
    pub author: String,
    pub head_branch: String,
    pub base_branch: String,
    pub head_sha: String,
    pub review_decision: Option<GithubReviewDecision>,
    pub requested_reviewers: Vec<String>,
    pub latest_reviews: Vec<(String, GithubReviewDecision)>,
    pub body: Option<String>,
    pub checks: Option<PrChecksSummary>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A submitted GitHub review (the Activity tab's review entries).
#[derive(Debug, Clone)]
pub struct GitHubPrReview {
    pub author: String,
    pub state: Option<GithubReviewDecision>,
    pub body: String,
    pub submitted_at: Option<DateTime<Utc>>,
}

/// A line-anchored review comment (Activity tab).
#[derive(Debug, Clone)]
pub struct GitHubReviewComment {
    pub author: String,
    pub body: String,
    pub path: Option<String>,
    pub line: Option<u32>,
    pub created_at: DateTime<Utc>,
}

/// A general PR conversation comment (Activity tab).
#[derive(Debug, Clone)]
pub struct GitHubIssueComment {
    pub author: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

/// A line comment to attach to a submitted review.
#[derive(Debug, Clone, Serialize)]
pub struct SubmitReviewComment {
    pub path: String,
    pub line: u32,
    pub side: String,
    pub body: String,
}

#[derive(Debug, Deserialize)]
struct GhAuthor {
    #[serde(default)]
    login: String,
}

#[derive(Debug, Deserialize)]
struct GhReviewRequest {
    #[serde(default)]
    login: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GhLatestReview {
    #[serde(default)]
    author: Option<GhAuthor>,
    #[serde(default)]
    state: Option<String>,
}

/// One entry of `statusCheckRollup`. GitHub returns a heterogeneous array of
/// `CheckRun` (status + conclusion) and `StatusContext` (state) nodes.
#[derive(Debug, Deserialize)]
struct GhStatusCheck {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    conclusion: Option<String>,
    #[serde(default)]
    state: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GhPrSummaryResponse {
    number: u32,
    #[serde(default)]
    title: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    state: String,
    #[serde(rename = "isDraft", default)]
    is_draft: bool,
    #[serde(default)]
    author: Option<GhAuthor>,
    #[serde(rename = "headRefName", default)]
    head_ref_name: String,
    #[serde(rename = "baseRefName", default)]
    base_ref_name: String,
    #[serde(rename = "headRefOid", default)]
    head_ref_oid: String,
    #[serde(rename = "reviewDecision", default)]
    review_decision: Option<String>,
    #[serde(rename = "reviewRequests", default)]
    review_requests: Vec<GhReviewRequest>,
    #[serde(rename = "latestReviews", default)]
    latest_reviews: Vec<GhLatestReview>,
    #[serde(default)]
    body: Option<String>,
    #[serde(rename = "statusCheckRollup", default)]
    status_check_rollup: Vec<GhStatusCheck>,
    #[serde(rename = "createdAt", default)]
    created_at: String,
    #[serde(rename = "updatedAt", default)]
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct GhUserResponse {
    #[serde(default)]
    login: String,
}

#[derive(Debug, Deserialize)]
struct GhReviewResponse {
    user: Option<GhUserResponse>,
    body: Option<String>,
    state: Option<String>,
    submitted_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GhReviewCommentResponse {
    user: Option<GhUserResponse>,
    body: Option<String>,
    path: Option<String>,
    line: Option<u32>,
    created_at: String,
}

#[derive(Debug, Deserialize)]
struct GhIssueCommentResponse {
    user: Option<GhUserResponse>,
    body: Option<String>,
    created_at: String,
}

fn pr_state_from_list(state: &str, is_draft: bool) -> PrState {
    match state.trim().to_ascii_uppercase().as_str() {
        "MERGED" => PrState::Merged,
        "CLOSED" => PrState::Closed,
        "OPEN" if is_draft => PrState::Draft,
        _ => PrState::Open,
    }
}

enum CheckOutcome {
    Passing,
    Failing,
    Pending,
}

/// Classify one rollup node. `CheckRun` carries status+conclusion; `StatusContext`
/// carries a flat state. Unknown/empty conclusions are treated as pending.
fn classify_check(check: &GhStatusCheck) -> CheckOutcome {
    if let Some(status) = check.status.as_deref() {
        if !status.trim().eq_ignore_ascii_case("COMPLETED") {
            return CheckOutcome::Pending;
        }
        return match check.conclusion.as_deref().map(str::trim) {
            Some(c) if c.eq_ignore_ascii_case("SUCCESS") => CheckOutcome::Passing,
            Some(c) if c.eq_ignore_ascii_case("NEUTRAL") || c.eq_ignore_ascii_case("SKIPPED") => {
                CheckOutcome::Passing
            }
            Some("") | None => CheckOutcome::Pending,
            _ => CheckOutcome::Failing,
        };
    }
    match check.state.as_deref().map(str::trim) {
        Some(s) if s.eq_ignore_ascii_case("SUCCESS") => CheckOutcome::Passing,
        Some(s) if s.eq_ignore_ascii_case("FAILURE") || s.eq_ignore_ascii_case("ERROR") => {
            CheckOutcome::Failing
        }
        _ => CheckOutcome::Pending,
    }
}

fn aggregate_checks(checks: &[GhStatusCheck]) -> Option<PrChecksSummary> {
    let (mut passing, mut failing, mut pending) = (0u32, 0u32, 0u32);
    for check in checks {
        match classify_check(check) {
            CheckOutcome::Passing => passing += 1,
            CheckOutcome::Failing => failing += 1,
            CheckOutcome::Pending => pending += 1,
        }
    }
    PrChecksSummary::from_counts(passing, failing, pending)
}

fn summary_from_response(item: GhPrSummaryResponse) -> Result<GitHubPrSummary> {
    let updated_at = if item.updated_at.trim().is_empty() {
        Utc::now()
    } else {
        parse_github_timestamp(&item.updated_at).context("failed to parse PR updatedAt")?
    };
    let created_at = if item.created_at.trim().is_empty() {
        updated_at
    } else {
        parse_github_timestamp(&item.created_at).context("failed to parse PR createdAt")?
    };
    let latest_reviews = item
        .latest_reviews
        .into_iter()
        .filter_map(|review| {
            let login = review.author?.login;
            let state = review
                .state
                .as_deref()
                .and_then(GithubReviewDecision::from_github)?;
            if login.is_empty() {
                None
            } else {
                Some((login, state))
            }
        })
        .collect();
    Ok(GitHubPrSummary {
        number: item.number,
        title: item.title,
        url: item.url,
        state: pr_state_from_list(&item.state, item.is_draft),
        is_draft: item.is_draft,
        author: item.author.map(|author| author.login).unwrap_or_default(),
        head_branch: item.head_ref_name,
        base_branch: item.base_ref_name,
        head_sha: item.head_ref_oid,
        review_decision: item
            .review_decision
            .as_deref()
            .and_then(GithubReviewDecision::from_github),
        requested_reviewers: item
            .review_requests
            .into_iter()
            .filter_map(|request| request.login)
            .collect(),
        latest_reviews,
        body: item
            .body
            .map(|body| body.trim().to_string())
            .filter(|body| !body.is_empty()),
        checks: aggregate_checks(&item.status_check_rollup),
        created_at,
        updated_at,
    })
}

/// List the PRs of a repository for the review inbox. `state` is one of
/// `open` / `closed` / `merged` / `all`. One `gh pr list` call carries the
/// review decision and requested reviewers, avoiding a per-PR fan-out.
pub async fn fetch_pr_list(
    repo_slug: &str,
    state: &str,
    limit: u32,
) -> Result<Vec<GitHubPrSummary>> {
    let limit = limit.clamp(1, 100).to_string();
    debug!(%repo_slug, %state, "listing PRs for review inbox");
    let output = run_gh(
        &[
            "pr",
            "list",
            "--repo",
            repo_slug,
            "--state",
            state,
            "--limit",
            &limit,
            "--json",
            PR_SUMMARY_JSON_FIELDS,
        ],
        None,
    )
    .await?;
    let items: Vec<GhPrSummaryResponse> =
        serde_json::from_slice(&output.stdout).context("failed to parse `gh pr list` response")?;
    items.into_iter().map(summary_from_response).collect()
}

/// Fetch a single PR's summary (detail header).
pub async fn fetch_pr_summary(repo_slug: &str, pr_number: u32) -> Result<GitHubPrSummary> {
    let number = pr_number.to_string();
    let output = run_gh(
        &[
            "pr",
            "view",
            &number,
            "--repo",
            repo_slug,
            "--json",
            PR_SUMMARY_JSON_FIELDS,
        ],
        None,
    )
    .await?;
    let item: GhPrSummaryResponse =
        serde_json::from_slice(&output.stdout).context("failed to parse `gh pr view` response")?;
    summary_from_response(item)
}

/// Fetch submitted reviews on a PR (Activity tab).
pub async fn fetch_pr_reviews(repo_slug: &str, pr_number: u32) -> Result<Vec<GitHubPrReview>> {
    let endpoint = format!("repos/{repo_slug}/pulls/{pr_number}/reviews?per_page=100");
    let output = run_gh(&["api", &endpoint, "--paginate", "--slurp"], None).await?;
    let pages: Vec<Vec<GhReviewResponse>> =
        serde_json::from_slice(&output.stdout).context("failed to parse PR reviews response")?;
    pages
        .into_iter()
        .flatten()
        .map(|review| {
            Ok(GitHubPrReview {
                author: review.user.map(|user| user.login).unwrap_or_default(),
                state: review
                    .state
                    .as_deref()
                    .and_then(GithubReviewDecision::from_github),
                body: review.body.unwrap_or_default(),
                submitted_at: review
                    .submitted_at
                    .as_deref()
                    .map(parse_github_timestamp)
                    .transpose()?,
            })
        })
        .collect()
}

/// Fetch line-anchored review comments on a PR (Activity tab).
pub async fn fetch_pr_review_comments(
    repo_slug: &str,
    pr_number: u32,
) -> Result<Vec<GitHubReviewComment>> {
    let endpoint = format!("repos/{repo_slug}/pulls/{pr_number}/comments?per_page=100");
    let output = run_gh(&["api", &endpoint, "--paginate", "--slurp"], None).await?;
    let pages: Vec<Vec<GhReviewCommentResponse>> = serde_json::from_slice(&output.stdout)
        .context("failed to parse PR review comments response")?;
    pages
        .into_iter()
        .flatten()
        .map(|comment| {
            Ok(GitHubReviewComment {
                author: comment.user.map(|user| user.login).unwrap_or_default(),
                body: comment.body.unwrap_or_default(),
                path: comment.path,
                line: comment.line,
                created_at: parse_github_timestamp(&comment.created_at)?,
            })
        })
        .collect()
}

/// Fetch general PR conversation comments (Activity tab).
pub async fn fetch_pr_issue_comments(
    repo_slug: &str,
    pr_number: u32,
) -> Result<Vec<GitHubIssueComment>> {
    let endpoint = format!("repos/{repo_slug}/issues/{pr_number}/comments?per_page=100");
    let output = run_gh(&["api", &endpoint, "--paginate", "--slurp"], None).await?;
    let pages: Vec<Vec<GhIssueCommentResponse>> = serde_json::from_slice(&output.stdout)
        .context("failed to parse PR issue comments response")?;
    pages
        .into_iter()
        .flatten()
        .map(|comment| {
            Ok(GitHubIssueComment {
                author: comment.user.map(|user| user.login).unwrap_or_default(),
                body: comment.body.unwrap_or_default(),
                created_at: parse_github_timestamp(&comment.created_at)?,
            })
        })
        .collect()
}

/// Submit a GitHub review (comment / approve / request-changes) with optional
/// line comments. `event` is the GitHub Reviews API value.
pub async fn submit_pr_review(
    repo_slug: &str,
    pr_number: u32,
    event: &str,
    body: &str,
    comments: &[SubmitReviewComment],
) -> Result<()> {
    let endpoint = format!("repos/{repo_slug}/pulls/{pr_number}/reviews");
    let payload = serde_json::json!({
        "event": event,
        "body": body,
        "comments": comments,
    });
    let payload = serde_json::to_vec(&payload).context("serialize review payload")?;
    debug!(%repo_slug, pr_number, %event, comments = comments.len(), "submitting GitHub review");
    run_gh_with_stdin(
        &["api", &endpoint, "--method", "POST", "--input", "-"],
        &payload,
        None,
    )
    .await?;
    info!(%repo_slug, pr_number, %event, "GitHub review submitted");
    Ok(())
}

/// The authenticated GitHub login, for "Created by you" / "Needs your review".
pub async fn fetch_viewer_login() -> Result<String> {
    let output = run_gh(&["api", "user", "--jq", ".login"], None).await?;
    let login = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if login.is_empty() {
        bail!("`gh api user` returned no login");
    }
    Ok(login)
}

async fn run_gh_with_stdin(
    args: &[&str],
    stdin_bytes: &[u8],
    cwd: Option<&Path>,
) -> Result<std::process::Output> {
    let mut cmd = Command::new("gh");
    cmd.args(args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    let mut child = cmd
        .spawn()
        .with_context(|| format!("failed to run `gh {}`", args.first().unwrap_or(&"")))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(stdin_bytes)
            .await
            .context("failed to write `gh` stdin")?;
        stdin.shutdown().await.ok();
    }
    let output = child
        .wait_with_output()
        .await
        .context("failed to wait for `gh`")?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("`gh {}` failed: {}", args.join(" "), stderr.trim());
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_gh_pr_list_summary() {
        let json = r#"[
            {
                "number": 7,
                "title": "Fix the thing",
                "url": "https://github.com/acme/repo/pull/7",
                "state": "OPEN",
                "isDraft": false,
                "author": {"login": "alice"},
                "headRefName": "feature",
                "baseRefName": "main",
                "headRefOid": "deadbeef",
                "reviewDecision": "CHANGES_REQUESTED",
                "reviewRequests": [{"login": "bob"}, {"name": "platform-team"}],
                "latestReviews": [{"author": {"login": "carol"}, "state": "APPROVED"}],
                "createdAt": "2026-06-13T09:00:00Z",
                "updatedAt": "2026-06-14T10:00:00Z"
            }
        ]"#;
        let items: Vec<GhPrSummaryResponse> = serde_json::from_str(json).unwrap();
        let summaries: Vec<GitHubPrSummary> = items
            .into_iter()
            .map(summary_from_response)
            .collect::<Result<_>>()
            .unwrap();
        let pr = &summaries[0];
        assert_eq!(pr.number, 7);
        assert_eq!(pr.state, PrState::Open);
        assert_eq!(pr.author, "alice");
        assert_eq!(pr.head_sha, "deadbeef");
        assert_eq!(
            pr.review_decision,
            Some(GithubReviewDecision::ChangesRequested)
        );
        assert_eq!(pr.requested_reviewers, vec!["bob".to_string()]);
        assert_eq!(
            pr.latest_reviews,
            vec![("carol".to_string(), GithubReviewDecision::Approved)]
        );
    }

    #[test]
    fn draft_open_pr_maps_to_draft_state() {
        assert_eq!(pr_state_from_list("OPEN", true), PrState::Draft);
        assert_eq!(pr_state_from_list("OPEN", false), PrState::Open);
        assert_eq!(pr_state_from_list("MERGED", false), PrState::Merged);
        assert_eq!(pr_state_from_list("CLOSED", false), PrState::Closed);
    }

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

    #[test]
    fn aggregates_status_check_rollup_from_gh_shape() {
        let rollup: Vec<GhStatusCheck> = serde_json::from_str(
            r#"[
                {"__typename":"CheckRun","name":"build","status":"COMPLETED","conclusion":"SUCCESS"},
                {"__typename":"CheckRun","name":"flaky","status":"IN_PROGRESS","conclusion":""},
                {"__typename":"StatusContext","context":"ci/circle","state":"FAILURE"}
            ]"#,
        )
        .unwrap();
        let summary = aggregate_checks(&rollup).expect("has checks");
        assert_eq!(summary.total, 3);
        assert_eq!(summary.passing, 1);
        assert_eq!(summary.failing, 1);
        assert_eq!(summary.pending, 1);
        assert_eq!(summary.state, superkick_core::PrChecksState::Failing);
    }

    #[test]
    fn empty_status_check_rollup_is_none() {
        assert!(aggregate_checks(&[]).is_none());
    }
}
