//! Pull-request resolution + GitHub sync (runtime service layer).
//!
//! Owns the get-or-create-from-artifact policy and the staleness window that
//! previously lived inline in the `runs` HTTP handler. GitHub/persist failures
//! stay logged-not-propagated: a PR view degrades gracefully rather than 500ing
//! a run-detail load when `gh` is unavailable.

use std::sync::Arc;
use std::time::Duration;

use superkick_core::{ArtifactKind, LinkedPrSummary, PullRequest, RunId, parse_pr_number};
use superkick_storage::repo::{ArtifactRepo, PullRequestRepo};

/// Re-sync a non-terminal PR from GitHub only after this window elapses. Keeps
/// run-detail loads from hammering `gh api` on every refresh while still
/// surfacing merge/close transitions promptly.
pub const PR_SYNC_STALENESS_THRESHOLD: Duration = Duration::from_secs(60);

pub struct PullRequestService<P, A>
where
    P: PullRequestRepo + 'static,
    A: ArtifactRepo + 'static,
{
    pr_repo: Arc<P>,
    artifact_repo: Arc<A>,
}

impl<P, A> PullRequestService<P, A>
where
    P: PullRequestRepo + 'static,
    A: ArtifactRepo + 'static,
{
    pub fn new(pr_repo: Arc<P>, artifact_repo: Arc<A>) -> Arc<Self> {
        Arc::new(Self {
            pr_repo,
            artifact_repo,
        })
    }

    /// Resolve the PullRequest for a run. Lazily creates a record from the
    /// PrUrl artifact if one doesn't exist yet. Syncs state from GitHub if
    /// stale.
    pub async fn resolve_pr(&self, run_id: RunId, repo_slug: &str) -> Option<PullRequest> {
        // Check for existing PR record first.
        if let Ok(Some(mut pr)) = self.pr_repo.get_by_run(run_id).await {
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
