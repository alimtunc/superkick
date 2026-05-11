//! Shared agent-spawn plumbing — Linear context + MCP policy resolution.
//!
//! Originally lived as `pub(super)` methods on `StepEngine` (see
//! `step_engine::agent`). SUP-124 extracts the logic into free functions so
//! both the playbook engine and the new `RealStepRunner` for Launch Tasks
//! reuse the same delivery rules (Linear snapshot fetch + MCP allowlist
//! materialisation + audit reconciliation) without duplicating the ~150 LoC
//! and silently drifting.
//!
//! The functions take repos and the linear client by reference so callers
//! don't need to share the `StepEngine`'s generic substrate.
//!
//! See `prepare_mcp_policy` / `build_linear_snapshot_block` for the original
//! prose on *what* each step does — this module preserves that behaviour
//! verbatim.
//!
//! No DB writes happen here beyond the `RunEvent` audit lines; both callers
//! still own the surrounding session insert.

use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;

use anyhow::{Context, Result};
use tracing::warn;

use superkick_config::McpServerSpec;
use superkick_core::{
    AgentProvider, EventKind, EventLevel, LaunchReason, LinearContextMode, ResolvedAgent, Run,
    RunId, StepId,
};
use superkick_storage::repo::RunEventRepo;

use crate::agent_supervisor::{AgentLaunchConfig, PolicyAudit, SessionLaunchInfo};
use crate::linear_context::{MCP_READONLY_DIRECTIVE, OptionalLinearClient, fetch_issue_context};
use crate::mcp_policy::{resolve_servers, write_role_mcp_config};
use crate::step_engine::emit_event;

/// Resolved delivery plan for a single child-agent spawn.
#[derive(Debug, Clone)]
pub struct AgentSpawnPlan {
    /// What actually ran (after any degradation). Recorded on the session.
    pub effective_mode: LinearContextMode,
    /// Markdown block to inject into the prompt, when one was built.
    pub snapshot_block: Option<String>,
    /// Provider CLI args to append after the prompt.
    pub extra_cli_args: Vec<String>,
    /// Audit columns for the agent_sessions row.
    pub policy_audit: PolicyAudit,
}

/// Resolve the role's MCP + Linear delivery plan for a spawn.
///
/// Behaviour matches the original `StepEngine::prepare_mcp_policy`:
///
/// - Linear context (`none|snapshot|snapshot_plus_mcp`) is fetched via the
///   shared client when available; absent client → degrade to `none` with a
///   warning emitted on the run ledger.
/// - The role's MCP allowlist is materialised against `mcp_registry` and
///   written under `<worktree>/.superkick/`. Claude gets
///   `--mcp-config <path> --strict-mcp-config`; Codex has no equivalent flag
///   in v1 and is recorded as "no servers used" honestly.
/// - The `LinearContextMode` returned is the *effective* mode after any
///   degradation, so the persisted audit row reflects what the child saw.
pub async fn resolve_spawn_plan<E>(
    run: &Run,
    resolved: &ResolvedAgent,
    worktree: &Path,
    step_id: StepId,
    event_repo: &E,
    mcp_registry: &HashMap<String, McpServerSpec>,
    linear_client: &OptionalLinearClient,
) -> Result<AgentSpawnPlan>
where
    E: RunEventRepo,
{
    let snapshot_block =
        build_linear_snapshot_block(run, resolved, step_id, event_repo, linear_client).await?;

    let linear_mode_after_snapshot = if snapshot_block.is_some() {
        resolved.linear_context
    } else {
        LinearContextMode::None
    };

    let resolved_servers = resolve_servers(&resolved.mcp_policy, mcp_registry);

    if !resolved_servers.missing.is_empty() {
        emit_event(
            event_repo,
            run.id,
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
                    emit_event(
                        event_repo,
                        run.id,
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
                warn!(
                    run_id = %run.id,
                    role = %resolved.role,
                    error = %e,
                    "failed to write role-scoped MCP config — continuing without MCP"
                );
                emit_event(
                    event_repo,
                    run.id,
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

    let (effective_mode, snapshot_block) = match linear_mode_after_snapshot {
        LinearContextMode::SnapshotPlusMcp if !mcp_wired_against_linear => {
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

    emit_event(
        event_repo,
        run.id,
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

/// Inputs needed to materialise an `AgentLaunchConfig` once the spawn plan
/// has been resolved. Kept as a struct so the call site reads as
/// `build_launch_config(&inputs)` rather than a 10-positional-arg function.
pub struct LaunchConfigInputs<'a> {
    pub run_id: RunId,
    pub step_id: StepId,
    pub resolved: &'a ResolvedAgent,
    /// Final prompt to pass to the agent (after `--`). Callers compose this
    /// via `build_full_prompt`.
    pub prompt: String,
    pub workdir: std::path::PathBuf,
    pub default_timeout: Duration,
    /// Free-form purpose recorded on the `AgentSession` row.
    pub purpose: String,
    pub launch_reason: LaunchReason,
}

/// Compose an `AgentLaunchConfig` from a resolved spawn plan and run-side
/// inputs. The argv is `[program, ...resolved.args, ...spawn_plan.extra_cli_args, "--", prompt]`
/// per the contract enforced by the Claude argv parser (`--` separator before
/// a prompt that may start with `---`).
pub fn build_launch_config(
    spawn_plan: &AgentSpawnPlan,
    inputs: LaunchConfigInputs<'_>,
) -> AgentLaunchConfig {
    let LaunchConfigInputs {
        run_id,
        step_id,
        resolved,
        prompt,
        workdir,
        default_timeout,
        purpose,
        launch_reason,
    } = inputs;

    let mut args = vec![resolved.program.clone()];
    args.extend(resolved.args.iter().cloned());
    args.extend(spawn_plan.extra_cli_args.iter().cloned());
    args.push("--".to_string());
    args.push(prompt);

    AgentLaunchConfig {
        run_id,
        step_id,
        provider: resolved.provider,
        args,
        workdir,
        timeout: resolved.timeout.unwrap_or(default_timeout),
        linear_context_mode: spawn_plan.effective_mode,
        policy_audit: spawn_plan.policy_audit.clone(),
        session_launch: SessionLaunchInfo {
            role: resolved.role.clone(),
            purpose,
            parent_session_id: None,
            launch_reason,
            handoff_id: None,
        },
    }
}

async fn build_linear_snapshot_block<E>(
    run: &Run,
    resolved: &ResolvedAgent,
    step_id: StepId,
    event_repo: &E,
    linear_client: &OptionalLinearClient,
) -> Result<Option<String>>
where
    E: RunEventRepo,
{
    let requested = resolved.linear_context;
    if matches!(requested, LinearContextMode::None) {
        return Ok(None);
    }

    let Some(client) = linear_client.as_ref() else {
        warn!(
            run_id = %run.id,
            role = %resolved.role,
            requested = %requested,
            "Linear client not configured — downgrading role context to `none`"
        );
        emit_event(
            event_repo,
            run.id,
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
