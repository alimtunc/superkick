//! Issue-level GitHub PR discovery and diff caching.
//!
//! This complements the run-scoped `PullRequestService`: Linear issue pages can
//! show PRs even when Superkick never launched a run for that issue.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::sync::Mutex;

use chrono::Utc;
use serde::Serialize;
use superkick_core::{
    GitHubPullRequestRef, IssuePullRequest, IssuePullRequestSource, PrDiffFile, PrState,
    parse_github_pr_url,
};
use superkick_integrations::linear::{IssueAttachment, IssueDetailResponse};
use superkick_storage::repo::IssuePullRequestRepo;

use crate::pull_request_service::PR_SYNC_STALENESS_THRESHOLD;

#[derive(Debug, Clone, Serialize)]
pub struct IssuePullRequestDiff {
    pub pr: IssuePullRequest,
    pub files: Vec<PrDiffFile>,
    pub cached: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum IssuePullRequestError {
    #[error("pull request not found for issue")]
    PullRequestNotFound,
    #[error("pull request head SHA is unavailable; cannot cache diff")]
    MissingHeadSha,
    #[error(transparent)]
    Storage(anyhow::Error),
    #[error(transparent)]
    GitHub(anyhow::Error),
}

pub struct IssuePullRequestService<R>
where
    R: IssuePullRequestRepo + 'static,
{
    repo: Arc<R>,
    default_repo_slug: String,
    search_attempts: Mutex<HashMap<String, chrono::DateTime<Utc>>>,
}

impl<R> IssuePullRequestService<R>
where
    R: IssuePullRequestRepo + 'static,
{
    pub fn new(repo: Arc<R>, default_repo_slug: String) -> Arc<Self> {
        Arc::new(Self {
            repo,
            default_repo_slug,
            search_attempts: Mutex::new(HashMap::new()),
        })
    }

    /// Discover and refresh PRs for one Linear issue. Best-effort by design:
    /// GitHub failures are logged and the issue payload still returns.
    pub async fn sync_issue_prs(&self, issue: &IssueDetailResponse) -> Vec<IssuePullRequest> {
        let mut cached = self.list_cached(&issue.identifier).await;
        let attachment_refs = attachment_pr_refs(&issue.attachments);

        for (reference, attachment) in &attachment_refs {
            self.sync_reference(
                issue,
                reference,
                IssuePullRequestSource::LinearAttachment,
                Some(attachment),
                &cached,
            )
            .await;
        }

        if attachment_refs.is_empty()
            && cached.is_empty()
            && !self.default_repo_slug.is_empty()
            && self.should_attempt_search(&issue.identifier)
        {
            match superkick_integrations::github::search_prs_by_issue_identifier(
                &self.default_repo_slug,
                &issue.identifier,
                8,
            )
            .await
            {
                Ok(details) => {
                    for pr in details.into_iter().map(|details| {
                        details.into_issue_pull_request(
                            issue.id.clone(),
                            issue.identifier.clone(),
                            IssuePullRequestSource::GitHubSearch,
                        )
                    }) {
                        if let Err(err) = self.repo.upsert_issue_pr(&pr).await {
                            tracing::warn!(
                                issue = %issue.identifier,
                                repo_slug = %pr.repo_slug,
                                pr_number = pr.number,
                                error = %err,
                                "failed to persist GitHub-searched issue PR"
                            );
                        }
                    }
                }
                Err(err) => tracing::debug!(
                    issue = %issue.identifier,
                    repo_slug = %self.default_repo_slug,
                    error = %err,
                    "GitHub issue PR search failed"
                ),
            }
        }

        cached = self.list_cached(&issue.identifier).await;
        for pr in cached.clone() {
            if should_refresh(&pr) {
                match superkick_integrations::github::fetch_pr_details(&pr.repo_slug, pr.number)
                    .await
                {
                    Ok(details) => {
                        let refreshed = details.into_issue_pull_request(
                            issue.id.clone(),
                            issue.identifier.clone(),
                            pr.source,
                        );
                        if let Err(err) = self.repo.upsert_issue_pr(&refreshed).await {
                            tracing::warn!(
                                issue = %issue.identifier,
                                repo_slug = %refreshed.repo_slug,
                                pr_number = refreshed.number,
                                error = %err,
                                "failed to persist refreshed issue PR"
                            );
                        }
                    }
                    Err(err) => tracing::debug!(
                        issue = %issue.identifier,
                        repo_slug = %pr.repo_slug,
                        pr_number = pr.number,
                        error = %err,
                        "GitHub issue PR refresh failed"
                    ),
                }
            }
        }

        self.list_cached(&issue.identifier).await
    }

    pub async fn diff_files(
        &self,
        issue_id: &str,
        issue_identifier: &str,
        repo_slug: &str,
        number: u32,
    ) -> Result<IssuePullRequestDiff, IssuePullRequestError> {
        let mut pr = self
            .find_cached(issue_identifier, repo_slug, number)
            .await?
            .ok_or(IssuePullRequestError::PullRequestNotFound)?;

        match superkick_integrations::github::fetch_pr_details(repo_slug, number).await {
            Ok(details) => {
                pr = details.into_issue_pull_request(
                    issue_id.to_string(),
                    issue_identifier.to_string(),
                    pr.source,
                );
                self.repo
                    .upsert_issue_pr(&pr)
                    .await
                    .map_err(IssuePullRequestError::Storage)?;
            }
            Err(err) => tracing::debug!(
                issue = %issue_identifier,
                repo_slug,
                pr_number = number,
                error = %err,
                "GitHub issue PR detail refresh failed before diff fetch"
            ),
        }

        if pr.head_sha.trim().is_empty() {
            return Err(IssuePullRequestError::MissingHeadSha);
        }

        let cached = self
            .repo
            .list_diff_files(issue_identifier, repo_slug, number, &pr.head_sha)
            .await
            .map_err(IssuePullRequestError::Storage)?;
        if !cached.is_empty() {
            return Ok(IssuePullRequestDiff {
                pr,
                files: cached,
                cached: true,
            });
        }

        let files = superkick_integrations::github::fetch_pr_files(repo_slug, number)
            .await
            .map_err(IssuePullRequestError::GitHub)?;
        self.repo
            .replace_diff_files(issue_identifier, repo_slug, number, &pr.head_sha, &files)
            .await
            .map_err(IssuePullRequestError::Storage)?;

        Ok(IssuePullRequestDiff {
            pr,
            files,
            cached: false,
        })
    }

    async fn sync_reference(
        &self,
        issue: &IssueDetailResponse,
        reference: &GitHubPullRequestRef,
        source: IssuePullRequestSource,
        attachment: Option<&IssueAttachment>,
        cached: &[IssuePullRequest],
    ) {
        match superkick_integrations::github::fetch_pr_details(
            &reference.repo_slug,
            reference.number,
        )
        .await
        {
            Ok(details) => {
                let pr = details.into_issue_pull_request(
                    issue.id.clone(),
                    issue.identifier.clone(),
                    source,
                );
                if let Err(err) = self.repo.upsert_issue_pr(&pr).await {
                    tracing::warn!(
                        issue = %issue.identifier,
                        repo_slug = %pr.repo_slug,
                        pr_number = pr.number,
                        error = %err,
                        "failed to persist Linear-linked issue PR"
                    );
                }
            }
            Err(err) => {
                tracing::debug!(
                    issue = %issue.identifier,
                    repo_slug = %reference.repo_slug,
                    pr_number = reference.number,
                    error = %err,
                    "GitHub issue PR detail fetch failed"
                );
                let already_cached = cached
                    .iter()
                    .any(|pr| pr.repo_slug == reference.repo_slug && pr.number == reference.number);
                if !already_cached {
                    let pr = fallback_issue_pr(issue, reference, source, attachment);
                    if let Err(err) = self.repo.upsert_issue_pr(&pr).await {
                        tracing::warn!(
                            issue = %issue.identifier,
                            repo_slug = %pr.repo_slug,
                            pr_number = pr.number,
                            error = %err,
                            "failed to persist fallback issue PR"
                        );
                    }
                }
            }
        }
    }

    async fn list_cached(&self, issue_identifier: &str) -> Vec<IssuePullRequest> {
        match self.repo.list_by_issue(issue_identifier).await {
            Ok(mut prs) => {
                prs.sort_by(|a, b| {
                    b.updated_at
                        .cmp(&a.updated_at)
                        .then(b.number.cmp(&a.number))
                });
                prs
            }
            Err(err) => {
                tracing::warn!(
                    issue = %issue_identifier,
                    error = %err,
                    "failed to list cached issue PRs"
                );
                Vec::new()
            }
        }
    }

    async fn find_cached(
        &self,
        issue_identifier: &str,
        repo_slug: &str,
        number: u32,
    ) -> Result<Option<IssuePullRequest>, IssuePullRequestError> {
        let prs = self
            .repo
            .list_by_issue(issue_identifier)
            .await
            .map_err(IssuePullRequestError::Storage)?;
        Ok(prs
            .into_iter()
            .find(|pr| pr.repo_slug == repo_slug && pr.number == number))
    }

    fn should_attempt_search(&self, issue_identifier: &str) -> bool {
        let now = Utc::now();
        let Ok(mut attempts) = self.search_attempts.lock() else {
            return true;
        };
        if attempts.get(issue_identifier).is_some_and(|last| {
            (now - *last).num_seconds() <= PR_SYNC_STALENESS_THRESHOLD.as_secs() as i64
        }) {
            return false;
        }
        attempts.insert(issue_identifier.to_string(), now);
        true
    }
}

fn attachment_pr_refs(
    attachments: &[IssueAttachment],
) -> Vec<(GitHubPullRequestRef, IssueAttachment)> {
    let mut seen = HashSet::new();
    attachments
        .iter()
        .filter_map(|attachment| {
            let reference = parse_github_pr_url(&attachment.url)?;
            if seen.insert((reference.repo_slug.clone(), reference.number)) {
                Some((reference, attachment.clone()))
            } else {
                None
            }
        })
        .collect()
}

fn fallback_issue_pr(
    issue: &IssueDetailResponse,
    reference: &GitHubPullRequestRef,
    source: IssuePullRequestSource,
    attachment: Option<&IssueAttachment>,
) -> IssuePullRequest {
    let now = Utc::now();
    IssuePullRequest {
        issue_id: issue.id.clone(),
        issue_identifier: issue.identifier.clone(),
        repo_slug: reference.repo_slug.clone(),
        number: reference.number,
        url: format!(
            "https://github.com/{}/pull/{}",
            reference.repo_slug, reference.number
        ),
        state: PrState::Open,
        title: attachment
            .map(|attachment| attachment.title.trim())
            .filter(|title| !title.is_empty())
            .map_or_else(
                || format!("#{}", reference.number),
                |title| title.to_string(),
            ),
        head_branch: String::new(),
        head_sha: String::new(),
        base_branch: String::new(),
        source,
        created_at: now,
        updated_at: now,
        merged_at: None,
        synced_at: now,
    }
}

fn should_refresh(pr: &IssuePullRequest) -> bool {
    if pr.state.is_terminal() {
        return false;
    }
    let age = Utc::now() - pr.synced_at;
    age.num_seconds() > PR_SYNC_STALENESS_THRESHOLD.as_secs() as i64
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;
    use superkick_integrations::linear::{IssuePriority, IssueStatus};

    use super::*;

    fn issue() -> IssueDetailResponse {
        IssueDetailResponse {
            id: "issue-uuid".into(),
            identifier: "SUP-222".into(),
            title: "Issue".into(),
            status: IssueStatus {
                state_type: "started".into(),
                name: "In Progress".into(),
                color: "#aaa".into(),
            },
            priority: IssuePriority {
                value: 2,
                label: "High".into(),
            },
            url: "https://linear.app/acme/issue/SUP-222".into(),
            created_at: Utc.timestamp_opt(0, 0).unwrap(),
            updated_at: Utc.timestamp_opt(0, 0).unwrap(),
            description: String::new(),
            labels: vec![],
            assignee: None,
            project: None,
            cycle: None,
            estimate: None,
            due_date: None,
            parent: None,
            children: vec![],
            blocked_by: vec![],
            team_id: None,
            comments: vec![],
            linked_runs: vec![],
            linked_prs: vec![],
            attachments: vec![],
            history: vec![],
            history_has_more: false,
        }
    }

    #[test]
    fn extracts_unique_pr_refs_from_linear_attachments() {
        let attachments = vec![
            IssueAttachment {
                id: "att-1".into(),
                title: "PR".into(),
                url: "https://github.com/acme/superkick/pull/42".into(),
            },
            IssueAttachment {
                id: "att-2".into(),
                title: "Duplicate".into(),
                url: "https://github.com/acme/superkick/pull/42/files".into(),
            },
            IssueAttachment {
                id: "att-3".into(),
                title: "Issue".into(),
                url: "https://github.com/acme/superkick/issues/42".into(),
            },
        ];

        let refs = attachment_pr_refs(&attachments);

        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].0.repo_slug, "acme/superkick");
        assert_eq!(refs[0].0.number, 42);
        assert_eq!(refs[0].1.id, "att-1");
    }

    #[test]
    fn fallback_pr_keeps_linear_link_visible_without_github() {
        let issue = issue();
        let reference = GitHubPullRequestRef {
            repo_slug: "acme/superkick".into(),
            number: 42,
        };
        let attachment = IssueAttachment {
            id: "att-1".into(),
            title: "GitHub PR".into(),
            url: "https://github.com/acme/superkick/pull/42".into(),
        };

        let pr = fallback_issue_pr(
            &issue,
            &reference,
            IssuePullRequestSource::LinearAttachment,
            Some(&attachment),
        );

        assert_eq!(pr.issue_identifier, "SUP-222");
        assert_eq!(pr.url, "https://github.com/acme/superkick/pull/42");
        assert_eq!(pr.title, "GitHub PR");
        assert_eq!(pr.state, PrState::Open);
    }

    #[test]
    fn terminal_prs_do_not_refresh() {
        let mut pr = fallback_issue_pr(
            &issue(),
            &GitHubPullRequestRef {
                repo_slug: "acme/superkick".into(),
                number: 42,
            },
            IssuePullRequestSource::LinearAttachment,
            None,
        );
        pr.state = PrState::Merged;
        pr.synced_at = Utc.timestamp_opt(0, 0).unwrap();

        assert!(!should_refresh(&pr));
    }
}
