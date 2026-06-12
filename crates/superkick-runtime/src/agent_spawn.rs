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
    AgentBackend, AgentProvider, EventKind, EventLevel, LaunchReason, LinearContextMode,
    ReasoningEffort, ResolvedAgent, Run, RunId, RunnerMode, StepId,
};
use superkick_storage::repo::RunEventRepo;

use crate::agent_supervisor::{AgentLaunchConfig, PolicyAudit, SessionLaunchInfo};
use crate::linear_context::{MCP_READONLY_DIRECTIVE, OptionalLinearClient, fetch_issue_context};
use crate::mcp_policy::{resolve_servers, write_role_mcp_config};
use crate::runner_mode::apply_runner_mode;
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

    if let Some(backend) = resolved.backend.as_ref()
        && !matches!(backend, AgentBackend::Protocol)
    {
        emit_event(
            event_repo,
            run.id,
            Some(step_id),
            EventKind::AgentOutput,
            EventLevel::Info,
            format!(
                "role '{}' backend={} (issue {})",
                resolved.role,
                backend.audit_tag(),
                run.issue_identifier
            ),
        )
        .await;
    }

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
    /// Per-step reasoning effort. `Some` only for dynamic Launch Task steps;
    /// the legacy catalog path passes `None` and keeps its argv unchanged.
    pub reasoning: Option<ReasoningEffort>,
}

/// Compose an `AgentLaunchConfig` from a resolved spawn plan and run-side
/// inputs.
///
/// argv layout:
/// `[program, ...prepend_args, ...resolved.args, ...backend_extra_args,
///  ...append_args, ...spawn_plan.extra_cli_args,
///  (claude: --model/--effort)?, (--, prompt)?]`
///
/// `prepend_args` / `append_args` come from
/// [`apply_runner_mode`]; `(--, prompt)` is appended only when the runner
/// mode does NOT inject the prompt via stdin (i.e. `stdin_payload.is_none()`).
/// Backend rewriting via [`apply_claude_backend`] still applies — its
/// directive prefix is folded into the prompt before it is either argv-
/// appended or stdin-injected, so `claude_subagent` works the same way in
/// interactive mode.
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
        reasoning,
    } = inputs;

    let (backend_extra_args, prompt) = apply_claude_backend(resolved, prompt);
    let mode_applied = apply_runner_mode(resolved, prompt.clone());

    let mut args = vec![resolved.program.clone()];
    args.extend(mode_applied.prepend_args.iter().cloned());
    args.extend(resolved.args.iter().cloned());
    args.extend(backend_extra_args);
    args.extend(mode_applied.append_args.iter().cloned());
    args.extend(spawn_plan.extra_cli_args.iter().cloned());
    if matches!(resolved.provider, AgentProvider::Claude) {
        // The structured Codex adapter carries model on its own argv; the
        // Claude PTY path would otherwise silently drop a resolved model.
        if resolved.runner_mode == RunnerMode::InteractivePty
            && let Some(model) = resolved.model.as_ref()
        {
            args.push("--model".to_string());
            args.push(model.clone());
        }
        if let Some(effort) = reasoning {
            args.push("--effort".to_string());
            args.push(effort.claude_effort_value().to_string());
        }
    }
    // Codex ExecJson never spawns from this argv (the structured adapter owns
    // its own), so the override is takeover-PTY-only and cannot double-emit.
    if matches!(resolved.provider, AgentProvider::Codex)
        && resolved.runner_mode == RunnerMode::InteractivePty
        && let Some(effort) = reasoning
    {
        args.push("-c".to_string());
        args.push(format!(
            "model_reasoning_effort={}",
            effort.codex_config_value()
        ));
    }
    if mode_applied.stdin_payload.is_none() {
        args.push("--".to_string());
        args.push(prompt);
    }

    AgentLaunchConfig {
        run_id,
        step_id,
        provider: resolved.provider,
        args,
        workdir,
        timeout: resolved.timeout.unwrap_or(default_timeout),
        // Opt-in per spawn path; the Launch Task step runner overrides it from
        // config after this returns. Left `None` here keeps every other caller
        // (playbook engine) on the unchanged wall-clock-only behaviour.
        idle_timeout: None,
        linear_context_mode: spawn_plan.effective_mode,
        policy_audit: spawn_plan.policy_audit.clone(),
        session_launch: SessionLaunchInfo {
            role: resolved.role.clone(),
            purpose,
            parent_session_id: None,
            launch_reason,
            handoff_id: None,
        },
        initial_stdin: mode_applied.stdin_payload,
        runner_mode: resolved.runner_mode,
        billing_profile: resolved.billing_profile,
        // Set by the Launch Task step runner after this returns (PTY path only);
        // every other caller leaves the session-live hook disabled.
        session_live: None,
    }
}

/// Idempotence sentinel. Opaque on purpose so a hand-written operator brief
/// cannot organically start with it and silently suppress the directive. A
/// prompt that already emits its own skill directive (the lean interactive
/// path) prepends this so [`apply_claude_backend`] short-circuits instead of
/// double-injecting.
pub const BACKEND_DIRECTIVE_MARKER: &str = "__SUPERKICK_BACKEND_DIRECTIVE_v1__";

/// Translate an optional [`AgentBackend`] into argv + prompt mutations at
/// spawn time. See [`AgentBackend`] for the fallback contract. Pure, no I/O,
/// idempotent on the marker sentinel.
pub fn apply_claude_backend(resolved: &ResolvedAgent, prompt: String) -> (Vec<String>, String) {
    let Some(backend) = resolved.backend.as_ref() else {
        return (Vec::new(), prompt);
    };
    if !matches!(resolved.provider, AgentProvider::Claude) {
        return (Vec::new(), prompt);
    }
    if prompt.starts_with(BACKEND_DIRECTIVE_MARKER) {
        return (Vec::new(), prompt);
    }

    let directive = match backend {
        AgentBackend::Protocol => return (Vec::new(), prompt),
        AgentBackend::ClaudeSubagent { subagent_name } => format!(
            "{BACKEND_DIRECTIVE_MARKER}\n\
             Delegate this entire step to the Claude Code sub-agent named \
             `{subagent_name}` by invoking `Task(subagent_type=\"{subagent_name}\")` \
             with the operator brief below as its prompt. Do not perform the work \
             yourself — your role is to route the brief to the sub-agent and \
             return its result.\n\n"
        ),
        AgentBackend::ClaudeSkill { skills } => {
            let listed = skills
                .iter()
                .map(|s| format!("/{s}"))
                .collect::<Vec<_>>()
                .join(", ");
            format!(
                "{BACKEND_DIRECTIVE_MARKER}\n\
                 Before doing anything else, invoke the following Claude Code \
                 skill(s) in this order: {listed}. Treat the operator brief \
                 below as the input to those skills.\n\n"
            )
        }
    };

    let mut augmented = String::with_capacity(directive.len() + prompt.len());
    augmented.push_str(&directive);
    augmented.push_str(&prompt);
    (Vec::new(), augmented)
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

#[cfg(test)]
mod tests {
    use super::*;
    use superkick_core::{
        AgentBackend, BillingProfile, ResolvedMcpPolicy, ResolvedToolPolicy, RunnerMode,
    };

    fn resolved(provider: AgentProvider, backend: Option<AgentBackend>) -> ResolvedAgent {
        let runner_mode = RunnerMode::default_for(provider);
        ResolvedAgent {
            name: "test".into(),
            role: "test".into(),
            provider,
            model: None,
            system_prompt: None,
            program: match provider {
                AgentProvider::Claude => "claude".into(),
                AgentProvider::Codex => "codex".into(),
            },
            args: Vec::new(),
            timeout: None,
            max_turns: None,
            linear_context: LinearContextMode::None,
            mcp_policy: ResolvedMcpPolicy::default(),
            tool_policy: ResolvedToolPolicy::default(),
            backend,
            runner_mode,
            billing_profile: BillingProfile::default_for(provider, runner_mode),
        }
    }

    #[test]
    fn apply_backend_none_is_passthrough() {
        let r = resolved(AgentProvider::Claude, None);
        let (args, prompt) = apply_claude_backend(&r, "hello".into());
        assert!(args.is_empty());
        assert_eq!(prompt, "hello");
    }

    #[test]
    fn apply_backend_protocol_is_passthrough() {
        let r = resolved(AgentProvider::Claude, Some(AgentBackend::Protocol));
        let (args, prompt) = apply_claude_backend(&r, "hello".into());
        assert!(args.is_empty());
        assert_eq!(prompt, "hello");
    }

    #[test]
    fn apply_backend_subagent_prefixes_directive() {
        let r = resolved(
            AgentProvider::Claude,
            Some(AgentBackend::ClaudeSubagent {
                subagent_name: "planner".into(),
            }),
        );
        let (args, prompt) = apply_claude_backend(&r, "do the thing".into());
        assert!(args.is_empty());
        assert!(prompt.starts_with(BACKEND_DIRECTIVE_MARKER));
        assert!(prompt.contains("subagent_type=\"planner\""));
        assert!(prompt.ends_with("do the thing"));
    }

    #[test]
    fn apply_backend_skill_lists_each_skill() {
        let r = resolved(
            AgentProvider::Claude,
            Some(AgentBackend::ClaudeSkill {
                skills: vec!["ticket-plan".into(), "review".into()],
            }),
        );
        let (args, prompt) = apply_claude_backend(&r, "brief".into());
        assert!(args.is_empty());
        assert!(prompt.contains("/ticket-plan"));
        assert!(prompt.contains("/review"));
        assert!(prompt.find("/ticket-plan") < prompt.find("/review"));
    }

    #[test]
    fn apply_backend_is_noop_for_codex_even_when_set() {
        let r = resolved(
            AgentProvider::Codex,
            Some(AgentBackend::ClaudeSubagent {
                subagent_name: "planner".into(),
            }),
        );
        let (args, prompt) = apply_claude_backend(&r, "hello".into());
        assert!(args.is_empty());
        assert_eq!(prompt, "hello");
    }

    #[test]
    fn apply_backend_is_idempotent_on_subagent() {
        let r = resolved(
            AgentProvider::Claude,
            Some(AgentBackend::ClaudeSubagent {
                subagent_name: "planner".into(),
            }),
        );
        let (_, once) = apply_claude_backend(&r, "brief".into());
        let (_, twice) = apply_claude_backend(&r, once.clone());
        assert_eq!(once, twice);
    }

    #[test]
    fn apply_backend_is_idempotent_on_skill() {
        let r = resolved(
            AgentProvider::Claude,
            Some(AgentBackend::ClaudeSkill {
                skills: vec!["foo".into()],
            }),
        );
        let (_, once) = apply_claude_backend(&r, "brief".into());
        let (_, twice) = apply_claude_backend(&r, once.clone());
        assert_eq!(once, twice);
    }

    #[test]
    fn build_launch_config_with_subagent_backend_lands_directive_after_dash_dash() {
        use superkick_core::{RunId, StepId};

        let mut r = resolved(
            AgentProvider::Claude,
            Some(AgentBackend::ClaudeSubagent {
                subagent_name: "planner".into(),
            }),
        );
        // Pin headless mode so the argv `--`/prompt tail is exercised; interactive uses stdin (next test).
        r.runner_mode = RunnerMode::PrintStreamJson;
        r.billing_profile = BillingProfile::AgentSdkCredits;
        let plan = AgentSpawnPlan {
            effective_mode: LinearContextMode::None,
            snapshot_block: None,
            extra_cli_args: vec!["--model".into(), "opus".into()],
            policy_audit: PolicyAudit::default(),
        };
        let inputs = LaunchConfigInputs {
            run_id: RunId::new(),
            step_id: StepId::new(),
            resolved: &r,
            prompt: "operator brief".into(),
            workdir: std::path::PathBuf::from("/tmp"),
            default_timeout: Duration::from_secs(60),
            purpose: "test".into(),
            launch_reason: LaunchReason::InitialStep,
            reasoning: None,
        };

        let cfg = build_launch_config(&plan, inputs);

        let sep = cfg
            .args
            .iter()
            .position(|a| a == "--")
            .expect("`--` present");
        let prompt_arg = cfg.args.last().expect("prompt is last argv");

        assert_eq!(
            sep,
            cfg.args.len() - 2,
            "prompt sits immediately after `--`"
        );
        assert!(prompt_arg.starts_with(BACKEND_DIRECTIVE_MARKER));
        assert!(prompt_arg.contains("subagent_type=\"planner\""));
        assert!(prompt_arg.ends_with("operator brief"));
        assert!(
            cfg.args.iter().any(|a| a == "--model"),
            "spawn_plan.extra_cli_args still flow through: {:?}",
            cfg.args
        );
    }

    #[test]
    fn build_launch_config_interactive_claude_drops_dash_dash_and_routes_prompt_to_stdin() {
        use superkick_core::{RunId, StepId};

        let r = resolved(AgentProvider::Claude, None);
        // Defaults from resolved(): runner_mode = InteractivePty.
        assert_eq!(r.runner_mode, RunnerMode::InteractivePty);

        let plan = AgentSpawnPlan {
            effective_mode: LinearContextMode::None,
            snapshot_block: None,
            extra_cli_args: vec!["--mcp-config".into(), "/tmp/mcp.json".into()],
            policy_audit: PolicyAudit::default(),
        };
        let inputs = LaunchConfigInputs {
            run_id: RunId::new(),
            step_id: StepId::new(),
            resolved: &r,
            prompt: "go plan".into(),
            workdir: std::path::PathBuf::from("/tmp"),
            default_timeout: Duration::from_secs(60),
            purpose: "test".into(),
            launch_reason: LaunchReason::InitialStep,
            reasoning: None,
        };

        let cfg = build_launch_config(&plan, inputs);

        assert!(
            !cfg.args.iter().any(|a| a == "--"),
            "interactive mode: no `--`/prompt argv: {:?}",
            cfg.args
        );
        assert_eq!(cfg.initial_stdin.as_deref(), Some("go plan"));
        assert_eq!(cfg.runner_mode, RunnerMode::InteractivePty);
        assert_eq!(cfg.billing_profile, BillingProfile::Subscription);
    }

    #[test]
    fn build_launch_config_interactive_claude_with_subagent_directive_in_stdin() {
        use superkick_core::{RunId, StepId};

        let r = resolved(
            AgentProvider::Claude,
            Some(AgentBackend::ClaudeSubagent {
                subagent_name: "planner".into(),
            }),
        );
        let plan = AgentSpawnPlan {
            effective_mode: LinearContextMode::None,
            snapshot_block: None,
            extra_cli_args: Vec::new(),
            policy_audit: PolicyAudit::default(),
        };
        let inputs = LaunchConfigInputs {
            run_id: RunId::new(),
            step_id: StepId::new(),
            resolved: &r,
            prompt: "operator brief".into(),
            workdir: std::path::PathBuf::from("/tmp"),
            default_timeout: Duration::from_secs(60),
            purpose: "test".into(),
            launch_reason: LaunchReason::InitialStep,
            reasoning: None,
        };

        let cfg = build_launch_config(&plan, inputs);

        let stdin = cfg.initial_stdin.expect("interactive mode injects stdin");
        assert!(stdin.starts_with(BACKEND_DIRECTIVE_MARKER));
        assert!(stdin.contains("subagent_type=\"planner\""));
        assert!(stdin.ends_with("operator brief"));
    }

    #[test]
    fn build_launch_config_codex_exec_prepends_subcommand() {
        use superkick_core::{RunId, StepId};

        let r = resolved(AgentProvider::Codex, None);
        assert_eq!(r.runner_mode, RunnerMode::ExecJson);
        let plan = AgentSpawnPlan {
            effective_mode: LinearContextMode::None,
            snapshot_block: None,
            extra_cli_args: Vec::new(),
            policy_audit: PolicyAudit::default(),
        };
        let inputs = LaunchConfigInputs {
            run_id: RunId::new(),
            step_id: StepId::new(),
            resolved: &r,
            prompt: "p".into(),
            workdir: std::path::PathBuf::from("/tmp"),
            default_timeout: Duration::from_secs(60),
            purpose: "test".into(),
            launch_reason: LaunchReason::InitialStep,
            reasoning: None,
        };
        let cfg = build_launch_config(&plan, inputs);
        // argv = [codex, exec, --, p]
        assert_eq!(cfg.args[0], "codex");
        assert_eq!(cfg.args[1], "exec");
        assert!(cfg.args.iter().any(|a| a == "--"));
        assert!(cfg.initial_stdin.is_none());
    }

    fn empty_plan() -> AgentSpawnPlan {
        AgentSpawnPlan {
            effective_mode: LinearContextMode::None,
            snapshot_block: None,
            extra_cli_args: Vec::new(),
            policy_audit: PolicyAudit::default(),
        }
    }

    fn inputs_with_reasoning<'a>(
        resolved: &'a ResolvedAgent,
        reasoning: Option<ReasoningEffort>,
    ) -> LaunchConfigInputs<'a> {
        use superkick_core::{RunId, StepId};
        LaunchConfigInputs {
            run_id: RunId::new(),
            step_id: StepId::new(),
            resolved,
            prompt: "brief".into(),
            workdir: std::path::PathBuf::from("/tmp"),
            default_timeout: Duration::from_secs(60),
            purpose: "test".into(),
            launch_reason: LaunchReason::InitialStep,
            reasoning,
        }
    }

    #[test]
    fn build_launch_config_claude_pty_appends_model_and_effort() {
        let mut r = resolved(AgentProvider::Claude, None);
        r.model = Some("opus".into());

        let cfg = build_launch_config(
            &empty_plan(),
            inputs_with_reasoning(&r, Some(ReasoningEffort::High)),
        );

        let model_pos = cfg
            .args
            .iter()
            .position(|a| a == "--model")
            .expect("model flag on claude PTY argv");
        assert_eq!(cfg.args[model_pos + 1], "opus");
        let effort_pos = cfg
            .args
            .iter()
            .position(|a| a == "--effort")
            .expect("effort flag on claude PTY argv");
        assert_eq!(cfg.args[effort_pos + 1], "high");
        assert!(!cfg.args.iter().any(|a| a == "--"));
        assert_eq!(cfg.initial_stdin.as_deref(), Some("brief"));
    }

    #[test]
    fn build_launch_config_claude_print_stream_json_appends_effort_before_prompt_tail() {
        let mut r = resolved(AgentProvider::Claude, None);
        r.runner_mode = RunnerMode::PrintStreamJson;
        r.billing_profile = BillingProfile::AgentSdkCredits;
        r.model = Some("opus".into());

        let cfg = build_launch_config(
            &empty_plan(),
            inputs_with_reasoning(&r, Some(ReasoningEffort::Minimal)),
        );

        let effort_pos = cfg
            .args
            .iter()
            .position(|a| a == "--effort")
            .expect("effort flag on headless claude argv");
        assert_eq!(
            cfg.args[effort_pos + 1],
            "low",
            "minimal clamps to claude's floor"
        );
        let sep = cfg.args.iter().position(|a| a == "--").expect("`--` tail");
        assert!(effort_pos < sep, "effort flag sits before the prompt tail");
        assert!(
            !cfg.args.iter().any(|a| a == "--model"),
            "model stays PTY-only: {:?}",
            cfg.args
        );
    }

    #[test]
    fn build_launch_config_claude_without_reasoning_emits_no_effort_flag() {
        let r = resolved(AgentProvider::Claude, None);
        let cfg = build_launch_config(&empty_plan(), inputs_with_reasoning(&r, None));
        assert!(!cfg.args.iter().any(|a| a == "--effort"));
        assert!(!cfg.args.iter().any(|a| a == "--model"));
    }

    #[test]
    fn build_launch_config_codex_exec_json_ignores_reasoning() {
        let mut r = resolved(AgentProvider::Codex, None);
        r.model = Some("o3".into());
        assert_eq!(r.runner_mode, RunnerMode::ExecJson);
        let cfg = build_launch_config(
            &empty_plan(),
            inputs_with_reasoning(&r, Some(ReasoningEffort::Max)),
        );
        assert!(
            !cfg.args.iter().any(|a| a == "--effort"),
            "effort is claude-only; codex carries it via the structured adapter"
        );
        assert!(
            !cfg.args
                .iter()
                .any(|a| a.contains("model_reasoning_effort")),
            "exec_json reasoning belongs to the structured adapter, not this argv: {:?}",
            cfg.args
        );
        assert!(!cfg.args.iter().any(|a| a == "--model"));
    }

    #[test]
    fn build_launch_config_codex_pty_appends_reasoning_config_override() {
        let mut r = resolved(AgentProvider::Codex, None);
        r.runner_mode = RunnerMode::InteractivePty;
        r.billing_profile = BillingProfile::default_for(AgentProvider::Codex, r.runner_mode);
        let cfg = build_launch_config(
            &empty_plan(),
            inputs_with_reasoning(&r, Some(ReasoningEffort::Max)),
        );
        let c_pos = cfg
            .args
            .iter()
            .position(|a| a == "-c")
            .expect("-c override on codex PTY argv");
        assert_eq!(
            cfg.args[c_pos + 1],
            "model_reasoning_effort=xhigh",
            "max clamps to codex's ceiling"
        );
    }

    #[test]
    fn build_launch_config_codex_pty_without_reasoning_emits_no_override() {
        let mut r = resolved(AgentProvider::Codex, None);
        r.runner_mode = RunnerMode::InteractivePty;
        r.billing_profile = BillingProfile::default_for(AgentProvider::Codex, r.runner_mode);
        let cfg = build_launch_config(&empty_plan(), inputs_with_reasoning(&r, None));
        assert!(!cfg.args.iter().any(|a| a == "-c"));
        assert!(
            !cfg.args
                .iter()
                .any(|a| a.contains("model_reasoning_effort"))
        );
    }
}
