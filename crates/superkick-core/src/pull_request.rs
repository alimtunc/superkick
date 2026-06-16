use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::id::{PullRequestId, RunId};

/// GitHub pull request state as tracked by Superkick.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrState {
    Open,
    Draft,
    Merged,
    Closed,
}

impl PrState {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Merged | Self::Closed)
    }
}

impl std::fmt::Display for PrState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Open => "open",
            Self::Draft => "draft",
            Self::Merged => "merged",
            Self::Closed => "closed",
        };
        f.write_str(s)
    }
}

/// Operator-chosen ship action for a completed run's worktree.
///
/// The operator owns the final decision — Superkick never auto-ships. `PushOnly`
/// publishes the branch without opening a PR; `Draft`/`Ready` additionally open a
/// pull request (draft requires no review, ready is a deliberate "review this").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ShipMode {
    PushOnly,
    Draft,
    Ready,
}

impl ShipMode {
    /// Whether this mode opens a pull request (draft or ready).
    pub fn opens_pr(self) -> bool {
        matches!(self, Self::Draft | Self::Ready)
    }

    /// Whether the opened PR should be a draft.
    pub fn is_draft(self) -> bool {
        matches!(self, Self::Draft)
    }
}

/// A GitHub pull request linked to a Superkick run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullRequest {
    pub id: PullRequestId,
    pub run_id: RunId,
    pub number: u32,
    pub repo_slug: String,
    pub url: String,
    pub state: PrState,
    pub title: String,
    pub head_branch: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub merged_at: Option<DateTime<Utc>>,
}

impl PullRequest {
    pub fn new(
        run_id: RunId,
        number: u32,
        repo_slug: String,
        url: String,
        state: PrState,
        title: String,
        head_branch: String,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: PullRequestId::new(),
            run_id,
            number,
            repo_slug,
            url,
            state,
            title,
            head_branch,
            created_at: now,
            updated_at: now,
            merged_at: None,
        }
    }
}

/// Lightweight PR reference for embedding in summaries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedPrSummary {
    pub number: u32,
    pub url: String,
    pub state: PrState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merged_at: Option<DateTime<Utc>>,
}

impl From<&PullRequest> for LinkedPrSummary {
    fn from(pr: &PullRequest) -> Self {
        Self {
            number: pr.number,
            url: pr.url.clone(),
            state: pr.state,
            merged_at: pr.merged_at,
        }
    }
}

/// Source that first linked a GitHub PR to a Linear issue.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssuePullRequestSource {
    LinearAttachment,
    GitHubSearch,
    Manual,
}

impl std::fmt::Display for IssuePullRequestSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::LinearAttachment => "linear_attachment",
            Self::GitHubSearch => "github_search",
            Self::Manual => "manual",
        };
        f.write_str(s)
    }
}

/// A GitHub pull request linked directly to a Linear issue, independent of any
/// Superkick run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssuePullRequest {
    pub issue_id: String,
    pub issue_identifier: String,
    pub repo_slug: String,
    pub number: u32,
    pub url: String,
    pub state: PrState,
    pub title: String,
    pub head_branch: String,
    pub head_sha: String,
    pub base_branch: String,
    pub source: IssuePullRequestSource,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub merged_at: Option<DateTime<Utc>>,
    pub synced_at: DateTime<Utc>,
}

impl From<&IssuePullRequest> for LinkedPrSummary {
    fn from(pr: &IssuePullRequest) -> Self {
        Self {
            number: pr.number,
            url: pr.url.clone(),
            state: pr.state,
            merged_at: pr.merged_at,
        }
    }
}

/// GitHub file status from `GET /pulls/{number}/files`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrDiffFileStatus {
    Added,
    Modified,
    Removed,
    Renamed,
    Changed,
    Unchanged,
}

impl std::fmt::Display for PrDiffFileStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Added => "added",
            Self::Modified => "modified",
            Self::Removed => "removed",
            Self::Renamed => "renamed",
            Self::Changed => "changed",
            Self::Unchanged => "unchanged",
        };
        f.write_str(s)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrDiffFile {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    pub status: PrDiffFileStatus,
    pub additions: u32,
    pub deletions: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub patch: Option<String>,
    pub position: u32,
}

/// Operator-submitted GitHub review action (SUP-205).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrReviewEvent {
    Comment,
    Approve,
    RequestChanges,
}

impl PrReviewEvent {
    /// GitHub Reviews API `event` value.
    pub fn as_github_event(self) -> &'static str {
        match self {
            Self::Comment => "COMMENT",
            Self::Approve => "APPROVE",
            Self::RequestChanges => "REQUEST_CHANGES",
        }
    }
}

/// A GitHub review's state, or a PR's aggregate `reviewDecision`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GithubReviewDecision {
    Approved,
    ChangesRequested,
    Commented,
    Pending,
    Dismissed,
    ReviewRequired,
}

impl GithubReviewDecision {
    pub fn from_github(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_uppercase().as_str() {
            "APPROVED" => Some(Self::Approved),
            "CHANGES_REQUESTED" => Some(Self::ChangesRequested),
            "COMMENTED" => Some(Self::Commented),
            "PENDING" => Some(Self::Pending),
            "DISMISSED" => Some(Self::Dismissed),
            "REVIEW_REQUIRED" => Some(Self::ReviewRequired),
            _ => None,
        }
    }
}

/// Linear-like grouping for the `/reviews` inbox.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewBucket {
    NeedsYourReview,
    ChangesRequested,
    ReadyToMerge,
    CreatedByYou,
    WaitingForReview,
    Drafts,
    Completed,
}

/// Classify a PR into its inbox bucket. Pure: takes everything it needs as
/// arguments so the grouping logic is unit-testable without GitHub access.
pub fn classify_review_bucket(
    state: PrState,
    is_draft: bool,
    decision: Option<GithubReviewDecision>,
    author_login: &str,
    requested_reviewers: &[String],
    viewer_login: Option<&str>,
) -> ReviewBucket {
    if state.is_terminal() {
        return ReviewBucket::Completed;
    }
    if is_draft {
        return ReviewBucket::Drafts;
    }
    let viewer = viewer_login.map(|login| login.trim().to_ascii_lowercase());
    let is_author = viewer
        .as_deref()
        .is_some_and(|viewer| viewer == author_login.trim().to_ascii_lowercase());
    let is_requested_reviewer = viewer.as_deref().is_some_and(|viewer| {
        requested_reviewers
            .iter()
            .any(|reviewer| reviewer.trim().to_ascii_lowercase() == viewer)
    });
    if is_requested_reviewer && !is_author {
        return ReviewBucket::NeedsYourReview;
    }
    match decision {
        Some(GithubReviewDecision::ChangesRequested) => return ReviewBucket::ChangesRequested,
        Some(GithubReviewDecision::Approved) => return ReviewBucket::ReadyToMerge,
        _ => {}
    }
    if is_author {
        return ReviewBucket::CreatedByYou;
    }
    ReviewBucket::WaitingForReview
}

/// A reviewer on a PR and, when known, the state of their latest review.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrReviewer {
    pub login: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<GithubReviewDecision>,
}

/// Aggregate state of a PR's CI status-check rollup.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrChecksState {
    Pending,
    Passing,
    Failing,
}

/// Aggregated GitHub status-check rollup for a PR. Absent (`None`) means GitHub
/// reported no checks at all, which the UI renders differently from "all passed".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrChecksSummary {
    pub state: PrChecksState,
    pub total: u32,
    pub passing: u32,
    pub failing: u32,
    pub pending: u32,
}

impl PrChecksSummary {
    /// Roll per-check counts into a summary. A failing check dominates a pending
    /// one, which dominates passing. Returns `None` when there are no checks.
    pub fn from_counts(passing: u32, failing: u32, pending: u32) -> Option<Self> {
        let total = passing.saturating_add(failing).saturating_add(pending);
        if total == 0 {
            return None;
        }
        let state = if failing > 0 {
            PrChecksState::Failing
        } else if pending > 0 {
            PrChecksState::Pending
        } else {
            PrChecksState::Passing
        };
        Some(Self {
            state,
            total,
            passing,
            failing,
            pending,
        })
    }
}

/// A PR row in the `/reviews` inbox, with everything the grouped list needs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrInboxItem {
    pub repo_slug: String,
    pub number: u32,
    pub title: String,
    pub url: String,
    pub state: PrState,
    pub is_draft: bool,
    pub author: String,
    pub head_branch: String,
    pub base_branch: String,
    pub head_sha: String,
    pub reviewers: Vec<PrReviewer>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_decision: Option<GithubReviewDecision>,
    pub review_comment_count: u32,
    pub bucket: ReviewBucket,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_issue_identifier: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checks: Option<PrChecksSummary>,
    pub updated_at: DateTime<Utc>,
}

/// PR detail header for the review workspace.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrReviewDetail {
    pub pull_request: PrInboxItem,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_issue_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// A single GitHub activity entry rendered in the PR Activity tab.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrActivityKind {
    Opened,
    ReviewRequested,
    Commented,
    ReviewSubmitted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrActivityEvent {
    pub kind: PrActivityKind,
    pub actor: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decision: Option<GithubReviewDecision>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Normalized reference parsed from a GitHub PR URL.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct GitHubPullRequestRef {
    pub repo_slug: String,
    pub number: u32,
}

/// Parse a GitHub PR URL like `https://github.com/owner/repo/pull/42`.
pub fn parse_github_pr_url(url: &str) -> Option<GitHubPullRequestRef> {
    let trimmed = url.trim();
    let marker = "github.com/";
    let start = trimmed.find(marker)? + marker.len();
    let path = &trimmed[start..];
    let query_start = path.find('?');
    let fragment_start = path.find('#');
    let end = [query_start, fragment_start]
        .into_iter()
        .flatten()
        .min()
        .unwrap_or(path.len());
    let path = &path[..end];
    let mut segments = path.split('/').filter(|segment| !segment.is_empty());
    let owner = segments.next()?;
    let repo = segments.next()?;
    let pull = segments.next()?;
    if pull != "pull" {
        return None;
    }
    let number = segments.next()?.parse().ok()?;
    Some(GitHubPullRequestRef {
        repo_slug: format!("{owner}/{repo}"),
        number,
    })
}

/// Parse a GitHub PR number from a URL like `https://github.com/owner/repo/pull/42`.
/// Only matches URLs containing `/pull/<number>`.
pub fn parse_pr_number(url: &str) -> Option<u32> {
    if let Some(reference) = parse_github_pr_url(url) {
        return Some(reference.number);
    }
    let (prefix, number_str) = url.rsplit_once('/')?;
    if !prefix.ends_with("/pull") {
        return None;
    }
    number_str.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_summary_rolls_up_by_severity() {
        assert_eq!(PrChecksSummary::from_counts(0, 0, 0), None);
        assert_eq!(
            PrChecksSummary::from_counts(3, 0, 0).map(|s| s.state),
            Some(PrChecksState::Passing)
        );
        assert_eq!(
            PrChecksSummary::from_counts(2, 0, 1).map(|s| s.state),
            Some(PrChecksState::Pending)
        );
        assert_eq!(
            PrChecksSummary::from_counts(2, 1, 1).map(|s| s.state),
            Some(PrChecksState::Failing)
        );
        let summary = PrChecksSummary::from_counts(2, 1, 1).expect("non-empty");
        assert_eq!(summary.total, 4);
    }

    #[test]
    fn parse_pr_number_works() {
        assert_eq!(
            parse_pr_number("https://github.com/acme/repo/pull/42"),
            Some(42)
        );
        assert_eq!(
            parse_pr_number("https://github.com/acme/repo/pull/1"),
            Some(1)
        );
        assert_eq!(parse_pr_number("not-a-url"), None);
        assert_eq!(parse_pr_number(""), None);
    }

    #[test]
    fn parse_pr_number_rejects_non_pr_urls() {
        assert_eq!(
            parse_pr_number("https://github.com/acme/repo/issues/42"),
            None
        );
        assert_eq!(
            parse_pr_number("https://github.com/acme/repo/commit/123"),
            None
        );
    }

    #[test]
    fn parse_github_pr_url_extracts_repo_and_number() {
        assert_eq!(
            parse_github_pr_url("https://github.com/acme/superkick/pull/42"),
            Some(GitHubPullRequestRef {
                repo_slug: "acme/superkick".into(),
                number: 42
            })
        );
        assert_eq!(
            parse_github_pr_url("https://github.com/acme/superkick/pull/42/files#diff"),
            Some(GitHubPullRequestRef {
                repo_slug: "acme/superkick".into(),
                number: 42
            })
        );
        assert_eq!(
            parse_github_pr_url("https://github.com/acme/superkick/issues/42"),
            None
        );
    }

    #[test]
    fn ship_mode_classifies_pr_and_draft() {
        assert!(ShipMode::Draft.opens_pr());
        assert!(ShipMode::Ready.opens_pr());
        assert!(!ShipMode::PushOnly.opens_pr());

        assert!(ShipMode::Draft.is_draft());
        assert!(!ShipMode::Ready.is_draft());
        assert!(!ShipMode::PushOnly.is_draft());
    }

    #[test]
    fn pr_review_event_maps_to_github() {
        assert_eq!(PrReviewEvent::Comment.as_github_event(), "COMMENT");
        assert_eq!(PrReviewEvent::Approve.as_github_event(), "APPROVE");
        assert_eq!(
            PrReviewEvent::RequestChanges.as_github_event(),
            "REQUEST_CHANGES"
        );
    }

    #[test]
    fn classify_review_bucket_precedence() {
        // terminal wins over everything.
        assert_eq!(
            classify_review_bucket(PrState::Merged, false, None, "alice", &[], Some("bob")),
            ReviewBucket::Completed
        );
        // draft before reviewer/author checks.
        assert_eq!(
            classify_review_bucket(PrState::Draft, true, None, "bob", &[], Some("bob")),
            ReviewBucket::Drafts
        );
        // viewer is a requested reviewer (and not author).
        assert_eq!(
            classify_review_bucket(
                PrState::Open,
                false,
                None,
                "alice",
                &["bob".into()],
                Some("BOB")
            ),
            ReviewBucket::NeedsYourReview
        );
        // changes requested outranks authorship.
        assert_eq!(
            classify_review_bucket(
                PrState::Open,
                false,
                Some(GithubReviewDecision::ChangesRequested),
                "bob",
                &[],
                Some("bob")
            ),
            ReviewBucket::ChangesRequested
        );
        // approved -> ready to merge.
        assert_eq!(
            classify_review_bucket(
                PrState::Open,
                false,
                Some(GithubReviewDecision::Approved),
                "alice",
                &[],
                Some("bob")
            ),
            ReviewBucket::ReadyToMerge
        );
        // author with no decision.
        assert_eq!(
            classify_review_bucket(PrState::Open, false, None, "bob", &[], Some("bob")),
            ReviewBucket::CreatedByYou
        );
        // nothing else applies.
        assert_eq!(
            classify_review_bucket(PrState::Open, false, None, "alice", &[], Some("bob")),
            ReviewBucket::WaitingForReview
        );
    }

    #[test]
    fn ship_mode_serializes_snake_case() {
        assert_eq!(
            serde_json::to_string(&ShipMode::PushOnly).unwrap(),
            "\"push_only\""
        );
        assert_eq!(
            serde_json::from_str::<ShipMode>("\"draft\"").unwrap(),
            ShipMode::Draft
        );
    }
}
