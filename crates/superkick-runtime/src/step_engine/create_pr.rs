use std::sync::Arc;

use anyhow::{Context, Result, bail};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

use superkick_core::{Artifact, ArtifactKind, EventKind, EventLevel, RunStep};
use superkick_storage::repo::{
    AgentSessionRepo, ArtifactRepo, InterruptRepo, InterruptTxRepo, RunEventRepo, RunRepo,
    RunStepRepo,
};

use super::{StepEngine, emit_event, kill_child};

impl<R, ST, E, A, AR, I> StepEngine<R, ST, E, A, AR, I>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    AR: ArtifactRepo + 'static,
    I: InterruptRepo + InterruptTxRepo + 'static,
{
    /// Execute the CreatePr step: push branch and open a GitHub PR via `gh`.
    pub(super) async fn execute_create_pr(
        &self,
        run: &superkick_core::Run,
        step: &RunStep,
        worktree: &std::path::Path,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
        let (create, _generate_description) = self.find_pr_config();

        if !create {
            info!(run_id = %run.id, "PR creation disabled (create: false) — skipping");
            return Ok(());
        }

        let branch = run
            .branch_name
            .as_deref()
            .context("branch_name not set on run")?;

        self.ensure_remote(run, worktree).await?;
        self.commit_staged_changes(run, step, worktree).await?;
        self.verify_divergence(run, worktree, branch).await?;
        self.push_branch(run, step, worktree, branch).await?;
        self.open_pr(run, step, worktree, branch, cancel_token)
            .await
    }

    async fn ensure_remote(
        &self,
        run: &superkick_core::Run,
        worktree: &std::path::Path,
    ) -> Result<()> {
        let clone_url = crate::worktree::github_clone_url(&run.repo_slug);
        let remote_check = crate::git::git_raw(worktree, &["remote", "get-url", "origin"]).await;
        if !matches!(remote_check, Ok(output) if output.status.success()) {
            crate::git::git(worktree, &["remote", "add", "origin", &clone_url])
                .await
                .context("failed to add origin remote to worktree")?;
        }
        let _ = crate::git::git(worktree, &["fetch", "origin", &run.base_branch]).await;
        Ok(())
    }

    async fn commit_staged_changes(
        &self,
        run: &superkick_core::Run,
        step: &RunStep,
        worktree: &std::path::Path,
    ) -> Result<()> {
        let status_out = crate::git::git_raw(worktree, &["status", "--porcelain"])
            .await
            .context("failed to run git status")?;
        let has_changes = status_out.status.success()
            && !String::from_utf8_lossy(&status_out.stdout)
                .trim()
                .is_empty();

        if has_changes {
            self.emit(
                run,
                Some(step.id),
                EventKind::CommandOutput,
                EventLevel::Info,
                "$ git add -A && git commit".to_string(),
            )
            .await;

            crate::git::git(worktree, &["add", "-A"])
                .await
                .context("failed to stage changes")?;

            let commit_msg = format!("feat({}): implement changes", run.issue_identifier);
            crate::git::git(worktree, &["commit", "-m", &commit_msg])
                .await
                .context("failed to commit staged changes")?;
        }

        Ok(())
    }

    async fn verify_divergence(
        &self,
        run: &superkick_core::Run,
        worktree: &std::path::Path,
        branch: &str,
    ) -> Result<()> {
        let base_sha = crate::git::git(
            worktree,
            &["rev-parse", &format!("origin/{}", run.base_branch)],
        )
        .await
        .unwrap_or_default();

        let head_sha = crate::git::git(worktree, &["rev-parse", "HEAD"])
            .await
            .context("failed to get HEAD sha")?;

        if head_sha.trim() == base_sha.trim() {
            bail!(
                "no commits between '{}' and '{}' — the coding agent produced no changes",
                run.base_branch,
                branch
            );
        }

        Ok(())
    }

    async fn push_branch(
        &self,
        run: &superkick_core::Run,
        step: &RunStep,
        worktree: &std::path::Path,
        branch: &str,
    ) -> Result<()> {
        self.emit(
            run,
            Some(step.id),
            EventKind::CommandOutput,
            EventLevel::Info,
            format!("$ git push origin {branch}"),
        )
        .await;

        crate::git::git(worktree, &["push", "-u", "origin", branch])
            .await
            .with_context(|| format!("failed to push branch '{branch}' to origin"))?;

        Ok(())
    }

    async fn open_pr(
        &self,
        run: &superkick_core::Run,
        step: &RunStep,
        worktree: &std::path::Path,
        branch: &str,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
        let title = format!("{}: automated PR", run.issue_identifier);
        let body = format!(
            "Automated PR for issue {} (`{}`)\n\nGenerated by superkick.",
            run.issue_identifier, run.issue_id,
        );
        let gh_args = vec![
            "pr",
            "create",
            "--head",
            branch,
            "--base",
            &run.base_branch,
            "--title",
            &title,
            "--body",
            &body,
        ];

        self.emit(
            run,
            Some(step.id),
            EventKind::CommandOutput,
            EventLevel::Info,
            format!("$ gh {}", gh_args.join(" ")),
        )
        .await;

        let mut child = Command::new("gh")
            .args(&gh_args)
            .current_dir(worktree)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .context("failed to spawn `gh pr create`")?;

        let stdout = child.stdout.take();
        let event_repo = Arc::clone(&self.event_repo);
        let run_id = run.id;
        let step_id = step.id;
        let stdout_task = tokio::spawn(async move {
            let mut collected = String::new();
            if let Some(out) = stdout {
                let mut lines = BufReader::new(out).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    emit_event(
                        &*event_repo,
                        run_id,
                        Some(step_id),
                        EventKind::CommandOutput,
                        EventLevel::Info,
                        line.clone(),
                    )
                    .await;
                    if !collected.is_empty() {
                        collected.push('\n');
                    }
                    collected.push_str(&line);
                }
            }
            collected
        });

        let stderr = child.stderr.take();
        let event_repo = Arc::clone(&self.event_repo);
        let stderr_task = tokio::spawn(async move {
            if let Some(err) = stderr {
                let mut lines = BufReader::new(err).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    emit_event(
                        &*event_repo,
                        run_id,
                        Some(step_id),
                        EventKind::CommandOutput,
                        EventLevel::Warn,
                        line,
                    )
                    .await;
                }
            }
        });

        let status = tokio::select! {
            status = child.wait() => {
                status.context("failed to wait on `gh pr create`")?
            }
            _ = cancel_token.cancelled() => {
                kill_child(&mut child).await;
                let _ = stdout_task.await;
                let _ = stderr_task.await;
                bail!("run cancelled during PR creation");
            }
        };

        let stdout_output = stdout_task.await.unwrap_or_else(|e| {
            warn!("stdout reader task panicked: {e}");
            String::new()
        });
        let _ = stderr_task.await;

        if !status.success() {
            bail!(
                "`gh pr create` failed with exit code {}",
                status.code().unwrap_or(-1)
            );
        }

        let pr_url = stdout_output.trim().to_string();
        if pr_url.is_empty() {
            bail!("`gh pr create` succeeded but produced no URL on stdout");
        }

        info!(run_id = %run.id, pr_url = %pr_url, "PR created");

        let artifact = Artifact::new(run.id, ArtifactKind::PrUrl, pr_url);
        self.artifact_repo
            .insert(&artifact)
            .await
            .context("failed to persist PR URL artifact")?;

        Ok(())
    }

    /// Extract PR config from the workflow steps, defaulting to create: true.
    pub(super) fn find_pr_config(&self) -> (bool, bool) {
        for ws in &self.config.workflow.steps {
            if let superkick_config::WorkflowStep::Pr {
                create,
                generate_description,
            } = ws
            {
                return (*create, *generate_description);
            }
        }
        (true, false)
    }
}
