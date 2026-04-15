use anyhow::{Context, Result, bail};

use superkick_core::{EventKind, EventLevel, LinearContextMode, ResolvedAgent, RunStep, StepKey};
use superkick_storage::repo::{
    AgentSessionRepo, ArtifactRepo, InterruptRepo, InterruptTxRepo, RunEventRepo, RunRepo,
    RunStepRepo, TranscriptRepo,
};
use tokio_util::sync::CancellationToken;

use super::{DEFAULT_AGENT_TIMEOUT, StepEngine, build_full_prompt};
use crate::agent_supervisor::AgentLaunchConfig;
use crate::linear_context::{MCP_READONLY_DIRECTIVE, fetch_issue_context, write_role_mcp_config};

impl<R, ST, E, A, AR, I, T> StepEngine<R, ST, E, A, AR, I, T>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    AR: ArtifactRepo + 'static,
    I: InterruptRepo + InterruptTxRepo + 'static,
    T: TranscriptRepo + 'static,
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
        let resolved = self
            .router()
            .resolve(agent_name)
            .with_context(|| format!("failed to resolve agent '{agent_name}'"))?;

        let mut args = vec![resolved.program.clone()];
        args.extend(resolved.args.iter().cloned());

        // SUP-86: resolve the Linear context delivery mode, fetch a snapshot
        // if requested, and wire a role-scoped MCP config when the role opts
        // in. `effective_mode` is what actually ran (after degradation when
        // no client is available) — that is what we record on the session.
        let ctx_plan = self
            .prepare_linear_context(run, &resolved, worktree, step.id)
            .await?;

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
            ctx_plan.snapshot_block.as_deref(),
        );
        // MCP flags MUST precede the positional prompt. The `--` separator
        // ends option parsing, so prompts that start with `---` (e.g. the
        // `--- Role system prompt ---` header) are not mistaken for CLI
        // options by Claude's argv parser.
        args.extend(ctx_plan.extra_cli_args.iter().cloned());
        args.push("--".to_string());
        args.push(prompt);

        let launch_cfg = AgentLaunchConfig {
            run_id: run.id,
            step_id: step.id,
            provider: resolved.provider,
            args,
            workdir: worktree.to_path_buf(),
            timeout: resolved.timeout.unwrap_or(DEFAULT_AGENT_TIMEOUT),
            linear_context_mode: ctx_plan.effective_mode,
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

    /// Resolve the role's Linear context delivery plan for this spawn.
    ///
    /// Behaviour per mode:
    /// - `None`          → nothing extra
    /// - `Snapshot`      → fetch snapshot; inject prompt block
    /// - `SnapshotPlusMcp` → fetch snapshot; write role-scoped `.mcp.json` under
    ///   the worktree; append `--mcp-config <path> --strict-mcp-config` to argv
    ///
    /// When the engine has no `LinearClient` (e.g. `LINEAR_API_KEY` unset), any
    /// mode that needs one downgrades to `None` with an emitted warning so the
    /// run still proceeds instead of failing at spawn time.
    pub(super) async fn prepare_linear_context(
        &self,
        run: &superkick_core::Run,
        resolved: &ResolvedAgent,
        worktree: &std::path::Path,
        step_id: superkick_core::StepId,
    ) -> Result<LinearContextPlan> {
        let requested = resolved.linear_context;
        if matches!(requested, LinearContextMode::None) {
            return Ok(LinearContextPlan::empty(LinearContextMode::None));
        }

        let Some(client) = self.linear_client() else {
            tracing::warn!(
                run_id = %run.id,
                role = %resolved.role,
                requested = %requested,
                "Linear client not configured — downgrading role context to `none`"
            );
            self.emit(
                run,
                Some(step_id),
                EventKind::AgentOutput,
                EventLevel::Warn,
                format!(
                    "role '{}' requested linear_context={requested} but no LINEAR_API_KEY is configured — downgraded to none",
                    resolved.role
                ),
            )
            .await;
            return Ok(LinearContextPlan::empty(LinearContextMode::None));
        };

        let context = fetch_issue_context(client, &run.issue_id)
            .await
            .with_context(|| {
                format!(
                    "failed to build Linear context for role '{}' on issue {}",
                    resolved.role, run.issue_identifier
                )
            })?;

        let mut snapshot_block = context.render_for_prompt();

        let mut extra_cli_args: Vec<String> = Vec::new();
        let effective_mode = if requested.includes_mcp() {
            match write_role_mcp_config(worktree, &resolved.role, &run.id.0.to_string()).await {
                Ok(artifact) => {
                    extra_cli_args = artifact.cli_args;
                    snapshot_block.push_str("\n\n");
                    snapshot_block.push_str(MCP_READONLY_DIRECTIVE);
                    LinearContextMode::SnapshotPlusMcp
                }
                Err(e) => {
                    tracing::warn!(
                        run_id = %run.id,
                        role = %resolved.role,
                        error = %e,
                        "failed to write role-scoped MCP config — downgrading to snapshot"
                    );
                    self.emit(
                        run,
                        Some(step_id),
                        EventKind::AgentOutput,
                        EventLevel::Warn,
                        format!(
                            "role '{}' MCP config write failed ({e}) — downgraded to snapshot",
                            resolved.role
                        ),
                    )
                    .await;
                    LinearContextMode::Snapshot
                }
            }
        } else {
            LinearContextMode::Snapshot
        };

        self.emit(
            run,
            Some(step_id),
            EventKind::AgentOutput,
            EventLevel::Info,
            format!(
                "role '{}' Linear context: {effective_mode} (issue {})",
                resolved.role, run.issue_identifier
            ),
        )
        .await;

        Ok(LinearContextPlan {
            effective_mode,
            snapshot_block: Some(snapshot_block),
            extra_cli_args,
        })
    }
}

/// Resolved delivery plan for a single child agent spawn.
pub(super) struct LinearContextPlan {
    /// What actually ran (after any degradation). Recorded on the session.
    pub effective_mode: LinearContextMode,
    /// Markdown block to inject into the prompt, when one was built.
    pub snapshot_block: Option<String>,
    /// Provider CLI args to append after the prompt.
    pub extra_cli_args: Vec<String>,
}

impl LinearContextPlan {
    fn empty(mode: LinearContextMode) -> Self {
        Self {
            effective_mode: mode,
            snapshot_block: None,
            extra_cli_args: Vec::new(),
        }
    }
}
