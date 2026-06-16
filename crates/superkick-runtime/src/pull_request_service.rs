//! Pull-request resolution + GitHub sync (runtime service layer).
//!
//! Owns the get-or-create-from-artifact policy and the staleness window that
//! previously lived inline in the `runs` HTTP handler. GitHub/persist failures
//! stay logged-not-propagated: a PR view degrades gracefully rather than 500ing
//! a run-detail load when `gh` is unavailable.

use std::sync::Arc;
use std::time::Duration;

use superkick_core::{
    ArtifactKind, LinkedPrSummary, PrState, PullRequest, Run, RunId, RunState, ShipMode,
    parse_pr_number,
};
use superkick_storage::repo::{ArtifactRepo, PullRequestRepo, RunRepo};

/// Re-sync a non-terminal PR from GitHub only after this window elapses. Keeps
/// run-detail loads from hammering `gh api` on every refresh while still
/// surfacing merge/close transitions promptly.
pub const PR_SYNC_STALENESS_THRESHOLD: Duration = Duration::from_secs(60);

/// Failure modes for an operator-triggered ship. Distinguished so the
/// API edge can map operator-actionable cases (no worktree, not authenticated,
/// nothing to ship) to 4xx and genuine internal faults to 5xx.
#[derive(Debug, thiserror::Error)]
pub enum ShipError {
    #[error("run has not completed successfully; only completed runs can be shipped")]
    RunNotShippable,
    #[error("a PR title is required for draft/ready mode")]
    EmptyTitle,
    #[error("run is not worktree-backed; shipping is worktree-only")]
    NotWorktreeBacked,
    #[error("run has no worktree on disk to ship from")]
    WorktreeMissing,
    #[error("run has no branch to push")]
    NoBranch,
    #[error("nothing to ship — no commits between the base branch and the run branch")]
    NoChanges,
    #[error("head branch cannot be changed after a PR exists")]
    HeadBranchLocked,
    #[error("{0}")]
    InvalidHeadBranch(String),
    #[error("{0}")]
    HeadBranchRename(String),
    #[error("{0}")]
    GhAuth(String),
    #[error("{0}")]
    GitHub(String),
    #[error(transparent)]
    Git(anyhow::Error),
    #[error(transparent)]
    Persist(anyhow::Error),
}

/// Result of a successful ship: the pushed branch and, for draft/ready modes, the
/// opened pull request. `pr` is `None` for `ShipMode::PushOnly`.
#[derive(Debug, Clone)]
pub struct ShipOutcome {
    pub pushed_branch: String,
    pub pr: Option<PullRequest>,
}

pub struct PullRequestService<P, A, R>
where
    P: PullRequestRepo + 'static,
    A: ArtifactRepo + 'static,
    R: RunRepo + 'static,
{
    pr_repo: Arc<P>,
    artifact_repo: Arc<A>,
    run_repo: Arc<R>,
}

impl<P, A, R> PullRequestService<P, A, R>
where
    P: PullRequestRepo + 'static,
    A: ArtifactRepo + 'static,
    R: RunRepo + 'static,
{
    pub fn new(pr_repo: Arc<P>, artifact_repo: Arc<A>, run_repo: Arc<R>) -> Arc<Self> {
        Arc::new(Self {
            pr_repo,
            artifact_repo,
            run_repo,
        })
    }

    /// Ship a completed run's worktree: commit any pending changes, push the
    /// branch, and (for draft/ready modes) open a PR. The operator owns this
    /// decision — it is never invoked automatically.
    ///
    /// Failures propagate (unlike the read-path sync, which degrades quietly): a
    /// ship that silently swallowed a failed push would mislead the operator into
    /// thinking work was published.
    pub async fn ship(
        &self,
        run: &Run,
        mode: ShipMode,
        title: &str,
        body: &str,
        head_branch: Option<&str>,
        commit_message: Option<&str>,
    ) -> Result<ShipOutcome, ShipError> {
        // Server-authoritative gate: the UI only offers Ship on a succeeded launch
        // task, but the run-scoped endpoint is directly reachable, so refuse to
        // publish a still-running, failed, or cancelled run's worktree.
        if run.state != RunState::Completed {
            return Err(ShipError::RunNotShippable);
        }
        if mode.opens_pr() && title.trim().is_empty() {
            return Err(ShipError::EmptyTitle);
        }
        if !run.use_worktree {
            return Err(ShipError::NotWorktreeBacked);
        }
        let current_branch = run.branch_name.as_deref().ok_or(ShipError::NoBranch)?;
        let worktree_path = run
            .worktree_path
            .as_deref()
            .ok_or(ShipError::WorktreeMissing)?;
        let worktree = std::path::Path::new(worktree_path);
        if !worktree.exists() {
            return Err(ShipError::WorktreeMissing);
        }

        // Validate the head-branch override before any side effect (commit,
        // remote add): a rejected rename must not mutate the worktree.
        let planned_head = match head_branch {
            None => None,
            Some(requested) => {
                let pr_exists = self.pr_exists(run.id).await?;
                match plan_head_branch(current_branch, requested, pr_exists)? {
                    None => None,
                    Some(new_name) => {
                        crate::git_ship::validate_branch_name(worktree, &new_name)
                            .await
                            .map_err(|e| ShipError::InvalidHeadBranch(e.to_string()))?;
                        Some(new_name)
                    }
                }
            }
        };

        superkick_integrations::github::check_gh_auth()
            .await
            .map_err(|e| ShipError::GhAuth(e.to_string()))?;

        crate::git_ship::ensure_origin_remote(worktree, &run.repo_slug, &run.base_branch)
            .await
            .map_err(ShipError::Git)?;

        // Operator-edited (often AI-proposed) commit message wins; fall back to
        // the conventional default when blank/omitted.
        let commit_msg = commit_message
            .map(str::trim)
            .filter(|m| !m.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| crate::git_ship::default_commit_message(&run.issue_identifier));
        crate::git_ship::commit_all_if_dirty(worktree, &commit_msg)
            .await
            .map_err(ShipError::Git)?;

        let has_commits = crate::git_ship::has_commits_against_base(worktree, &run.base_branch)
            .await
            .map_err(ShipError::Git)?;
        if !has_commits {
            return Err(ShipError::NoChanges);
        }

        let renamed = planned_head.is_some();
        let branch = match planned_head {
            None => current_branch.to_string(),
            Some(new_name) => {
                self.rename_head_branch(run, worktree, current_branch, &new_name)
                    .await?;
                new_name
            }
        };
        let branch = branch.as_str();

        crate::git_ship::push_branch(worktree, branch)
            .await
            .map_err(ShipError::Git)?;

        let pr = if mode.opens_pr() {
            // Re-check right before PR creation: a concurrent ship may have
            // opened a PR after the pre-rename gate passed.
            if renamed && self.pr_exists(run.id).await? {
                return Err(ShipError::HeadBranchLocked);
            }
            let url = superkick_integrations::github::create_pr(
                worktree,
                branch,
                &run.base_branch,
                title,
                body,
                mode.is_draft(),
            )
            .await
            .map_err(|e| ShipError::GitHub(e.to_string()))?;

            let number = parse_pr_number(&url).ok_or_else(|| {
                ShipError::GitHub(format!("could not parse PR number from URL: {url}"))
            })?;

            let mut pr = PullRequest::new(
                run.id,
                number,
                run.repo_slug.clone(),
                url,
                if mode.is_draft() {
                    PrState::Draft
                } else {
                    PrState::Open
                },
                title.to_string(),
                branch.to_string(),
            );
            // Re-ship: preserve the existing row's identity so the conflict-upsert
            // overwrites its number/url rather than orphaning the prior PR record.
            if let Some(prev) = self
                .pr_repo
                .get_by_run(run.id)
                .await
                .map_err(ShipError::Persist)?
            {
                pr.id = prev.id;
                pr.created_at = prev.created_at;
            }

            self.pr_repo.upsert(&pr).await.map_err(ShipError::Persist)?;
            Some(pr)
        } else {
            None
        };

        Ok(ShipOutcome {
            pushed_branch: branch.to_string(),
            pr,
        })
    }

    /// Whether a PR already exists for the run, counting both persisted rows
    /// and PrUrl artifacts: the autonomous `create_pr` step writes only the
    /// artifact until `resolve_pr` lazily materializes a row.
    async fn pr_exists(&self, run_id: RunId) -> Result<bool, ShipError> {
        let recorded = self
            .pr_repo
            .get_by_run(run_id)
            .await
            .map_err(ShipError::Persist)?
            .is_some();
        Ok(recorded || self.extract_pr_url_from_artifacts(run_id).await.is_some())
    }

    /// Apply an operator-requested head-branch rename (the name was validated
    /// upfront): rename in the worktree, then persist `run.branch_name` before
    /// the push so a later push failure leaves the DB consistent with the local
    /// branch. A persist failure rolls the rename back for the same reason.
    async fn rename_head_branch(
        &self,
        run: &Run,
        worktree: &std::path::Path,
        from: &str,
        to: &str,
    ) -> Result<(), ShipError> {
        crate::git_ship::rename_branch(worktree, from, to)
            .await
            .map_err(|e| ShipError::HeadBranchRename(e.to_string()))?;

        let mut renamed = run.clone();
        renamed.branch_name = Some(to.to_string());
        if let Err(persist_err) = self.run_repo.update(&renamed).await {
            if let Err(rollback_err) = crate::git_ship::rename_branch(worktree, to, from).await {
                tracing::warn!(
                    run_id = %run.id.0,
                    error = %rollback_err,
                    "failed to roll back head-branch rename after persist failure"
                );
            }
            return Err(ShipError::Persist(persist_err));
        }
        Ok(())
    }

    /// Resolve the PullRequest for a run. Lazily creates a record from the
    /// PrUrl artifact if one doesn't exist yet. Syncs state from GitHub if
    /// stale.
    pub async fn resolve_pr(&self, run_id: RunId, repo_slug: &str) -> Option<PullRequest> {
        let existing = match self.pr_repo.get_by_run(run_id).await {
            Ok(existing) => existing,
            Err(e) => {
                // A read failure must not fall through to the lazy-create
                // path: upserting a fresh record could rewrite the existing
                // row's identity (id/created_at/title).
                tracing::warn!(run_id = %run_id.0, error = %e, "failed to read PullRequest record");
                return None;
            }
        };
        if let Some(mut pr) = existing {
            // Sync from GitHub if PR is in a non-terminal state and stale.
            if !pr.state.is_terminal() {
                let age = chrono::Utc::now() - pr.updated_at;
                if age.num_seconds() > PR_SYNC_STALENESS_THRESHOLD.as_secs() as i64 {
                    self.sync_pr_state(&mut pr).await;
                }
            }
            return Some(pr);
        }

        // No PR record yet — try to create one from the PrUrl artifact.
        let pr_url = self.extract_pr_url_from_artifacts(run_id).await?;
        let number = parse_pr_number(&pr_url)?;

        let pr = PullRequest::new(
            run_id,
            number,
            repo_slug.to_string(),
            pr_url,
            PrState::Open,
            String::new(),
            String::new(),
        );

        if let Err(e) = self.pr_repo.upsert(&pr).await {
            tracing::warn!(run_id = %run_id.0, error = %e, "failed to persist PullRequest record");
        }

        // Immediately sync to get title and current state.
        let mut pr = pr;
        self.sync_pr_state(&mut pr).await;
        Some(pr)
    }

    /// Build a `LinkedPrSummary` for a run, used by the issues/queue surfaces.
    pub async fn resolve_pr_summary(
        &self,
        run_id: RunId,
        repo_slug: &str,
    ) -> Option<LinkedPrSummary> {
        self.resolve_pr(run_id, repo_slug)
            .await
            .as_ref()
            .map(LinkedPrSummary::from)
    }

    /// Extract a PR URL from the artifacts table (legacy path).
    async fn extract_pr_url_from_artifacts(&self, run_id: RunId) -> Option<String> {
        let artifacts = self.artifact_repo.list_by_run(run_id).await.ok()?;
        artifacts
            .into_iter()
            .find(|a| a.kind == ArtifactKind::PrUrl)
            .map(|a| a.path_or_url)
    }

    /// Fetch current state from GitHub and update the local record.
    async fn sync_pr_state(&self, pr: &mut PullRequest) {
        match superkick_integrations::github::fetch_pr_state(&pr.repo_slug, pr.number).await {
            Ok(gh) => {
                pr.state = gh.state;
                pr.title = gh.title;
                pr.merged_at = gh.merged_at;
                pr.updated_at = chrono::Utc::now();
                if let Err(e) = self.pr_repo.update(pr).await {
                    tracing::warn!(pr_id = %pr.id, error = %e, "failed to update PR state");
                }
            }
            Err(e) => {
                tracing::debug!(pr_number = pr.number, error = %e, "GitHub PR sync failed (gh cli may not be available)");
            }
        }
    }
}

/// Decide whether a requested head-branch override is a no-op, a rename, or a
/// rejection. Renames are locked once a PR exists — GitHub tracks the PR by its
/// head ref, so a rename would orphan it.
fn plan_head_branch(
    current: &str,
    requested: &str,
    pr_exists: bool,
) -> Result<Option<String>, ShipError> {
    let requested = requested.trim();
    if requested == current {
        return Ok(None);
    }
    if pr_exists {
        return Err(ShipError::HeadBranchLocked);
    }
    Ok(Some(requested.to_string()))
}

#[cfg(test)]
mod tests {
    use super::{ShipError, plan_head_branch};

    #[test]
    fn same_name_is_a_noop_even_with_whitespace() {
        assert_eq!(plan_head_branch("feat/x", "feat/x", false).unwrap(), None);
        assert_eq!(
            plan_head_branch("feat/x", "  feat/x  ", false).unwrap(),
            None
        );
    }

    #[test]
    fn same_name_with_existing_pr_is_still_a_noop() {
        assert_eq!(plan_head_branch("feat/x", "feat/x", true).unwrap(), None);
    }

    #[test]
    fn different_name_without_pr_renames_to_trimmed() {
        assert_eq!(
            plan_head_branch("feat/x", " feat/y ", false).unwrap(),
            Some("feat/y".to_string())
        );
    }

    #[test]
    fn different_name_with_existing_pr_is_rejected() {
        let err = plan_head_branch("feat/x", "feat/y", true).unwrap_err();
        assert!(matches!(err, ShipError::HeadBranchLocked));
    }
}
