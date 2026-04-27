use std::path::PathBuf;

use anyhow::{Context, Result};
use tracing::{info, warn};

use superkick_core::EventKind;
use superkick_core::EventLevel;
use superkick_storage::repo::{
    AgentSessionRepo, ArtifactRepo, AttentionRequestRepo, InterruptRepo, InterruptTxRepo,
    RunEventRepo, RunRepo, RunStepRepo, TranscriptRepo,
};

use super::StepEngine;
use crate::worktree::{WorktreeInfo, WorktreeManager};

impl<R, ST, E, A, AR, I, AT, T> StepEngine<R, ST, E, A, AR, I, AT, T>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    AR: ArtifactRepo + 'static,
    I: InterruptRepo + InterruptTxRepo + 'static,
    AT: AttentionRequestRepo + 'static,
    T: TranscriptRepo + 'static,
{
    /// Prepare step: ensure bare clone exists, create worktree (or use repo root).
    pub(super) async fn execute_prepare(&self, run: &mut superkick_core::Run) -> Result<()> {
        let clone_url = crate::worktree::github_clone_url(&run.repo_slug);
        let bare_path = self
            .repo_cache
            .ensure(&run.repo_slug, &clone_url)
            .await
            .context("failed to ensure bare clone")?;

        if run.use_worktree {
            let repo_root = PathBuf::from(&self.config.runner.repo_root);
            let wt_root = crate::worktree::default_worktree_root(&repo_root);

            let wt_mgr = WorktreeManager::new(
                bare_path,
                wt_root,
                self.config.runner.worktree_prefix.clone(),
            )
            .await
            .context("failed to create worktree manager")?;

            let WorktreeInfo { path, branch } = wt_mgr
                .create(run.id, &run.issue_identifier, &run.base_branch)
                .await
                .context("failed to create worktree")?;

            run.worktree_path = Some(path.to_string_lossy().into_owned());
            run.branch_name = Some(branch);
            self.run_repo.update(run).await?;

            info!(
                run_id = %run.id,
                worktree = %path.display(),
                "worktree created"
            );
        } else {
            let repo_root = PathBuf::from(&self.config.runner.repo_root);
            run.worktree_path = Some(repo_root.to_string_lossy().into_owned());
            self.run_repo.update(run).await?;

            info!(
                run_id = %run.id,
                path = %repo_root.display(),
                "worktree disabled — using repo root"
            );
        }

        Ok(())
    }

    /// Verify that required external tools (git, gh, agent CLIs) are
    /// reachable before starting a run.
    pub(super) async fn preflight_check(&self, run: &superkick_core::Run) -> Result<()> {
        use superkick_config::WorkflowStep;

        super::check_tool_exists("git")
            .await
            .context("git is not installed or not on PATH — install it: https://git-scm.com")?;

        let router = self.router();
        let mut needed_agents: std::collections::HashSet<String> = std::collections::HashSet::new();
        for ws in &self.config.workflow.steps {
            match ws {
                WorkflowStep::Plan { agent } | WorkflowStep::Code { agent } => {
                    if let Ok(resolved) = router.resolve(agent) {
                        needed_agents.insert(resolved.program);
                    }
                }
                WorkflowStep::ReviewSwarm { agents, .. } => {
                    for agent in agents {
                        if let Ok(resolved) = router.resolve(agent) {
                            needed_agents.insert(resolved.program);
                        }
                    }
                }
                WorkflowStep::Pr { create, .. } if *create => {
                    needed_agents.insert("gh".to_string());
                }
                _ => {}
            }
        }

        for tool in &needed_agents {
            super::check_tool_exists(tool).await.with_context(|| {
                format!("`{tool}` is not installed or not on PATH — the workflow requires it")
            })?;
        }

        self.emit(
            run,
            None,
            EventKind::StateChange,
            EventLevel::Info,
            "preflight checks passed".into(),
        )
        .await;

        Ok(())
    }

    /// Clean up the worktree directory after a run reaches a terminal state.
    /// Skipped when the run did not use a dedicated worktree.
    pub(super) async fn cleanup_worktree(&self, run: &superkick_core::Run) {
        if !run.use_worktree {
            return;
        }

        let Some(ref wt_path_str) = run.worktree_path else {
            return;
        };

        let wt_path = PathBuf::from(wt_path_str);
        if !wt_path.exists() {
            return;
        }

        let repo_root = PathBuf::from(&self.config.runner.repo_root);
        let bare_path = self.repo_cache.cache_path(&run.repo_slug);

        match WorktreeManager::new(
            bare_path,
            crate::worktree::default_worktree_root(&repo_root),
            self.config.runner.worktree_prefix.clone(),
        )
        .await
        {
            Ok(mgr) => {
                if let Err(e) = mgr.cleanup(&wt_path).await {
                    warn!(
                        run_id = %run.id,
                        path = %wt_path.display(),
                        error = %e,
                        "failed to clean up worktree (manual removal may be needed)"
                    );
                } else {
                    info!(
                        run_id = %run.id,
                        path = %wt_path.display(),
                        "worktree cleaned up"
                    );
                }
            }
            Err(e) => {
                warn!(
                    run_id = %run.id,
                    error = %e,
                    "failed to create worktree manager for cleanup"
                );
            }
        }
    }
}
