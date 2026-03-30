use anyhow::{Context, Result, bail};

use superkick_core::{RunStep, StepKey};
use superkick_storage::repo::{
    AgentSessionRepo, ArtifactRepo, InterruptRepo, RunEventRepo, RunRepo, RunStepRepo,
};
use tokio_util::sync::CancellationToken;

use super::{DEFAULT_AGENT_TIMEOUT, StepEngine, agent_command, build_full_prompt};
use crate::agent_supervisor::AgentLaunchConfig;

impl<R, ST, E, A, AR, I> StepEngine<R, ST, E, A, AR, I>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    AR: ArtifactRepo + 'static,
    I: InterruptRepo + 'static,
{
    /// Execute an agent step (Plan or Code) via the AgentSupervisor.
    pub(super) async fn execute_agent(
        &self,
        run: &superkick_core::Run,
        step: &RunStep,
        agent_name: &str,
        worktree: &std::path::Path,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
        let agent_cfg = self
            .config
            .agents
            .get(agent_name)
            .with_context(|| format!("agent '{agent_name}' not found in config"))?;

        let (program, base_args) = agent_command(&agent_cfg.provider);

        let mut args = vec![program.to_string()];
        args.extend(base_args.iter().map(|s| s.to_string()));

        let base_prompt = match step.step_key {
            StepKey::Plan => format!(
                "You are working on issue {} (id: {}). \
                 Analyze the codebase and create a detailed implementation plan. \
                 Describe the files to change, the approach, and any risks. \
                 Do NOT make code changes yet — only plan. \
                 IMPORTANT: Do NOT update the issue status in Linear or any external tracker. \
                 Do NOT mark the issue as done, closed, or resolved. Only plan the implementation.",
                run.issue_identifier, run.issue_id,
            ),
            StepKey::Code => format!(
                "You are working on issue {} (id: {}). \
                 Implement the changes needed to resolve this issue. \
                 Follow the existing code style and patterns. \
                 Make all necessary code changes. \
                 IMPORTANT: Do NOT update the issue status in Linear or any external tracker. \
                 Do NOT mark the issue as done, closed, or resolved. Only write code.",
                run.issue_identifier, run.issue_id,
            ),
            other => format!(
                "You are working on issue {} (id: {}). Execute step: {:?}. \
                 IMPORTANT: Do NOT update the issue status in Linear or any external tracker. \
                 Do NOT mark the issue as done, closed, or resolved.",
                run.issue_identifier, run.issue_id, other,
            ),
        };

        let default_instructions = &self.config.launch_profile.default_instructions;
        let prompt = build_full_prompt(
            &base_prompt,
            Some(default_instructions.as_str()).filter(|s| !s.is_empty()),
            run.operator_instructions.as_deref(),
            self.handoff_for_step(step.step_key),
        );
        args.push(prompt);

        let launch_cfg = AgentLaunchConfig {
            run_id: run.id,
            step_id: step.id,
            provider: agent_cfg.provider,
            args,
            workdir: worktree.to_path_buf(),
            timeout: DEFAULT_AGENT_TIMEOUT,
        };

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
