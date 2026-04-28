use anyhow::{Context, Result, bail};

use superkick_core::{
    AgentProvider, EventKind, EventLevel, LaunchReason, LinearContextMode, ResolvedAgent, RunStep,
    StepKey,
};
use superkick_storage::repo::{
    AgentSessionRepo, ArtifactRepo, AttentionRequestRepo, InterruptRepo, InterruptTxRepo,
    RunEventRepo, RunRepo, RunStepRepo, TranscriptRepo,
};
use tokio_util::sync::CancellationToken;

use super::{DEFAULT_AGENT_TIMEOUT, StepEngine, build_full_prompt};
use crate::agent_supervisor::{AgentLaunchConfig, PolicyAudit, SessionLaunchInfo};
use crate::linear_context::{MCP_READONLY_DIRECTIVE, fetch_issue_context};
use crate::mcp_policy::{resolve_servers, write_role_mcp_config};

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

        let ctx_plan = self
            .prepare_mcp_policy(run, &resolved, worktree, step.id)
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
            policy_audit: ctx_plan.policy_audit.clone(),
            session_launch: SessionLaunchInfo {
                role: resolved.role.clone(),
                purpose: format!("{} agent for issue {}", step.step_key, run.issue_identifier),
                parent_session_id: None,
                launch_reason: LaunchReason::InitialStep,
                handoff_id: None,
            },
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

    /// Resolve the role's MCP + Linear delivery plan for this spawn.
    ///
    /// Two policies are folded together here:
    ///
    /// - Linear context delivery (`linear_context: none|snapshot|snapshot_plus_mcp`)
    ///   decides whether we fetch a Linear `IssueContext` and inject it
    ///   into the prompt. When the engine has no `LinearClient` (e.g.
    ///   `LINEAR_API_KEY` unset), any mode that needs one downgrades to
    ///   `none` with an emitted warning.
    /// - The role's MCP policy (`mcp.servers` allowlist, post-desugaring
    ///   from `snapshot_plus_mcp`) is materialised against the project
    ///   registry into a per-role `.mcp.json` file under
    ///   `<worktree>/.superkick/`. For Claude, `--mcp-config <path>
    ///   --strict-mcp-config` is appended; for Codex, the file is still
    ///   written for inspection but no flag is appended (no equivalent in
    ///   v1) and the audit row records `mcp_servers_used = []`.
    ///
    /// Both paths degrade gracefully — a failed MCP write or missing
    /// registry entry is logged and the spawn proceeds without MCP.
    pub(super) async fn prepare_mcp_policy(
        &self,
        run: &superkick_core::Run,
        resolved: &ResolvedAgent,
        worktree: &std::path::Path,
        step_id: superkick_core::StepId,
    ) -> Result<AgentSpawnPlan> {
        // 1. Linear snapshot (independent from MCP wiring; the modes can
        //    coexist but a role can also use MCP without any Linear input).
        let snapshot_block = self
            .build_linear_snapshot_block(run, resolved, step_id)
            .await?;

        let linear_mode_after_snapshot = if snapshot_block.is_some() {
            // Sugar: `snapshot_plus_mcp` carries through verbatim until we
            // know whether the MCP file also wrote successfully — see below.
            resolved.linear_context
        } else {
            LinearContextMode::None
        };

        // 2. MCP wiring (server allowlist resolved against the project
        //    registry). The desugaring of `snapshot_plus_mcp` already
        //    placed `linear` into `resolved.mcp_policy.servers` at
        //    catalog-build time. The registry was resolved once at
        //    `StepEngine::new` time so we don't reclone it per spawn.
        let resolved_servers = resolve_servers(&resolved.mcp_policy, self.mcp_registry());

        if !resolved_servers.missing.is_empty() {
            self.emit(
                run,
                Some(step_id),
                EventKind::AgentOutput,
                EventLevel::Warn,
                format!(
                    "role '{}' references unknown MCP servers: {} — dropped",
                    resolved.role,
                    resolved_servers.missing.join(", ")
                ),
            )
            .await;
        }

        let mut extra_cli_args: Vec<String> = Vec::new();
        let mut audit_servers: Vec<String> = Vec::new();
        let mut mcp_wired_against_linear = false;

        if !resolved_servers.entries.is_empty() {
            match write_role_mcp_config(
                worktree,
                resolved.provider,
                &resolved.role,
                &run.id.0.to_string(),
                &resolved_servers.entries,
            )
            .await
            {
                Ok(artifact) => {
                    if matches!(resolved.provider, AgentProvider::Codex) {
                        // v1: Codex has no equivalent to `--mcp-config
                        // --strict-mcp-config`. We deliberately leave the
                        // generated file under `.superkick/` so the
                        // operator can inspect *what would have been
                        // wired* if Codex grows the flag (and so the
                        // run's audit trail is symmetrical with Claude).
                        // The child gets nothing — `audit_servers` stays
                        // empty so `mcp_servers_used` honestly records
                        // "none". The file is gitignored and re-written
                        // per spawn, so leftover files are not a leak
                        // surface.
                        self.emit(
                            run,
                            Some(step_id),
                            EventKind::AgentOutput,
                            EventLevel::Warn,
                            format!(
                                "role '{}' MCP policy not enforced: Codex provider has no \
                                 strict-mcp-config equivalent in v1 — recorded as no servers used",
                                resolved.role
                            ),
                        )
                        .await;
                    } else {
                        extra_cli_args = artifact.cli_args;
                        audit_servers = artifact.server_names.clone();
                        mcp_wired_against_linear = artifact
                            .server_names
                            .iter()
                            .any(|n| n == superkick_config::LINEAR_MCP_SERVER_NAME);
                    }
                }
                Err(e) => {
                    tracing::warn!(
                        run_id = %run.id,
                        role = %resolved.role,
                        error = %e,
                        "failed to write role-scoped MCP config — continuing without MCP"
                    );
                    self.emit(
                        run,
                        Some(step_id),
                        EventKind::AgentOutput,
                        EventLevel::Warn,
                        format!(
                            "role '{}' MCP config write failed ({e}) — continuing without MCP",
                            resolved.role
                        ),
                    )
                    .await;
                }
            }
        }

        // 3. Reconcile the effective Linear-context mode with what
        //    actually got wired. The audit column on the session must
        //    reflect what the child actually saw.
        let (effective_mode, snapshot_block) = match linear_mode_after_snapshot {
            LinearContextMode::SnapshotPlusMcp if !mcp_wired_against_linear => {
                // We fetched the snapshot but the Linear MCP didn't make
                // it into the on-disk config (write error, dropped from
                // registry, or Codex). The role still has the prompt
                // snapshot — record honestly as `snapshot`.
                (LinearContextMode::Snapshot, snapshot_block)
            }
            LinearContextMode::SnapshotPlusMcp => {
                let mut block = snapshot_block.unwrap_or_default();
                block.push_str("\n\n");
                block.push_str(MCP_READONLY_DIRECTIVE);
                (LinearContextMode::SnapshotPlusMcp, Some(block))
            }
            mode => (mode, snapshot_block),
        };

        self.emit(
            run,
            Some(step_id),
            EventKind::AgentOutput,
            EventLevel::Info,
            format!(
                "role '{}' MCP policy: linear={} mcp_servers=[{}] (issue {})",
                resolved.role,
                effective_mode,
                audit_servers.join(", "),
                run.issue_identifier
            ),
        )
        .await;

        let policy_audit = PolicyAudit {
            mcp_servers_used: audit_servers,
            tools_allow_snapshot: resolved.tool_policy.allow_snapshot(),
            tool_approval_required: resolved.tool_policy.require_approval,
            tool_results_persisted: resolved.tool_policy.persist_results,
        };

        Ok(AgentSpawnPlan {
            effective_mode,
            snapshot_block,
            extra_cli_args,
            policy_audit,
        })
    }

    /// Fetch the Linear issue snapshot when the role asked for one and a
    /// client is available. Returns `None` (with a warning emitted) when
    /// the role asked for context but the engine has no client wired.
    async fn build_linear_snapshot_block(
        &self,
        run: &superkick_core::Run,
        resolved: &ResolvedAgent,
        step_id: superkick_core::StepId,
    ) -> Result<Option<String>> {
        let requested = resolved.linear_context;
        if matches!(requested, LinearContextMode::None) {
            return Ok(None);
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
            return Ok(None);
        };

        let context = fetch_issue_context(client, &run.issue_id)
            .await
            .with_context(|| {
                format!(
                    "failed to build Linear context for role '{}' on issue {}",
                    resolved.role, run.issue_identifier
                )
            })?;

        Ok(Some(context.render_for_prompt()))
    }
}

/// Resolved delivery plan for a single child agent spawn.
pub(super) struct AgentSpawnPlan {
    /// What actually ran (after any degradation). Recorded on the session.
    pub effective_mode: LinearContextMode,
    /// Markdown block to inject into the prompt, when one was built.
    pub snapshot_block: Option<String>,
    /// Provider CLI args to append after the prompt.
    pub extra_cli_args: Vec<String>,
    /// Audit columns for the agent_sessions row.
    pub policy_audit: PolicyAudit,
}
