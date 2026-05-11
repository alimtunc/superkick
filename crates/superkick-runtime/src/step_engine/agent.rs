use anyhow::{Context, Result, bail};

use superkick_core::{LaunchReason, StepKey};
use superkick_storage::repo::{
    AgentSessionRepo, ArtifactRepo, AttentionRequestRepo, InterruptRepo, InterruptTxRepo,
    RunEventRepo, RunRepo, RunStepRepo, TranscriptRepo,
};
use tokio_util::sync::CancellationToken;

use super::prompts::{NO_LINEAR_UPDATE_GUARDRAIL, PromptStepKind, step_body_for};
use super::{DEFAULT_AGENT_TIMEOUT, StepEngine, build_full_prompt};
use crate::agent_spawn::{LaunchConfigInputs, build_launch_config, resolve_spawn_plan};

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
    /// Execute an agent step (Plan or Code) via the AgentSupervisor.
    pub(super) async fn execute_agent(
        &self,
        run: &superkick_core::Run,
        step: &superkick_core::RunStep,
        agent_name: &str,
        worktree: &std::path::Path,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
        let resolved = self
            .router()
            .resolve(agent_name)
            .with_context(|| format!("failed to resolve agent '{agent_name}'"))?;

        let spawn_plan = resolve_spawn_plan(
            run,
            &resolved,
            worktree,
            step.id,
            &*self.event_repo,
            self.mcp_registry(),
            &self.linear_client,
        )
        .await?;

        let base_prompt = match step.step_key {
            StepKey::Plan => format!(
                "You are working on issue {} (id: {}). {}",
                run.issue_identifier,
                run.issue_id,
                step_body_for(PromptStepKind::Plan),
            ),
            StepKey::Code => format!(
                "You are working on issue {} (id: {}). {}",
                run.issue_identifier,
                run.issue_id,
                step_body_for(PromptStepKind::Implement),
            ),
            other => format!(
                "You are working on issue {} (id: {}). Execute step: {:?}. {}",
                run.issue_identifier, run.issue_id, other, NO_LINEAR_UPDATE_GUARDRAIL,
            ),
        };

        // Re-read operator_instructions from DB so console input sent during
        // a previous step is included in the prompt.
        let live_instructions = match self.run_repo.get(run.id).await? {
            Some(fresh) => fresh.operator_instructions,
            None => run.operator_instructions.clone(),
        };

        let default_instructions = &self.config.launch_profile.default_instructions;
        let prompt = build_full_prompt(
            &base_prompt,
            Some(default_instructions.as_str()).filter(|s| !s.is_empty()),
            live_instructions.as_deref(),
            self.handoff_for_step(step.step_key),
            resolved.system_prompt.as_deref(),
            spawn_plan.snapshot_block.as_deref(),
        );

        let launch_cfg = build_launch_config(
            &spawn_plan,
            LaunchConfigInputs {
                run_id: run.id,
                step_id: step.id,
                resolved: &resolved,
                prompt,
                workdir: worktree.to_path_buf(),
                default_timeout: DEFAULT_AGENT_TIMEOUT,
                purpose: format!("{} agent for issue {}", step.step_key, run.issue_identifier),
                launch_reason: LaunchReason::InitialStep,
            },
        );

        let (handle, join) = self
            .supervisor
            .launch(launch_cfg)
            .await
            .context("failed to launch agent")?;

        let result = tokio::select! {
            res = join => {
                res.context("agent task panicked")?
                   .context("agent execution failed")?
            }
            _ = cancel_token.cancelled() => {
                handle.cancel();
                bail!("run cancelled during agent execution");
            }
        };

        if result.session.exit_code != Some(0) {
            bail!(
                "agent '{}' exited with code {}",
                agent_name,
                result.session.exit_code.unwrap_or(-1)
            );
        }

        Ok(())
    }
}
