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
            state: PrState::Open,
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

/// Parse a GitHub PR number from a URL like `https://github.com/owner/repo/pull/42`.
/// Only matches URLs containing `/pull/<number>`.
pub fn parse_pr_number(url: &str) -> Option<u32> {
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
    fn ship_mode_classifies_pr_and_draft() {
        assert!(ShipMode::Draft.opens_pr());
        assert!(ShipMode::Ready.opens_pr());
        assert!(!ShipMode::PushOnly.opens_pr());

        assert!(ShipMode::Draft.is_draft());
        assert!(!ShipMode::Ready.is_draft());
        assert!(!ShipMode::PushOnly.is_draft());
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
