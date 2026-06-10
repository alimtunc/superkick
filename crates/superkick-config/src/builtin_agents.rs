//! Superkick-shipped agent defaults — the "Codex-first" catalog.
//!
//! Every project gets these roles for free so a fresh install can launch
//! plan / implement / review without hand-authoring `agents:` in
//! `superkick.yaml`. A custom entry in YAML with the same name overrides the
//! built-in (see [`crate::SuperkickConfig::agent_catalog`]).
//!
//! Codex is the primary path for V1; Claude variants exist as a secondary
//! option. Naming is `<provider>-<role>` so the picker can group cleanly.
//!
//! Built-ins intentionally leave `system_prompt` and `model` unset so the
//! provider CLI's default model is used and the orchestrator's step prompt
//! is the single source of role behaviour. Tool / Linear policies mirror
//! the example YAML so the operator experience is identical.

use superkick_core::{
    AgentOrigin, AgentProvider, CoreAgentDefinition as CoreAgent, LinearContextMode, McpMode,
    ResolvedMcpPolicy, ResolvedToolPolicy,
};

use crate::model::LINEAR_MCP_SERVER_NAME;

/// Stable agent names for the V1 Codex/Claude catalog. Kept as `pub const`
/// so the validator and tests can reference them without re-spelling literals.
pub const CODEX_PLAN: &str = "codex-plan";
pub const CODEX_IMPLEMENT: &str = "codex-implement";
pub const CODEX_REVIEW: &str = "codex-review";
pub const CLAUDE_PLAN: &str = "claude-plan";
pub const CLAUDE_IMPLEMENT: &str = "claude-implement";
pub const CLAUDE_REVIEW: &str = "claude-review";

const ROLE_PLANNER: &str = "planner";
const ROLE_CODER: &str = "coder";
const ROLE_REVIEWER: &str = "reviewer";

/// Every built-in role, in stable picker order (Codex first, then Claude;
/// plan → implement → review within each provider).
#[must_use]
pub fn builtin_definitions() -> Vec<CoreAgent> {
    vec![
        planner(CODEX_PLAN, AgentProvider::Codex),
        coder(CODEX_IMPLEMENT, AgentProvider::Codex),
        reviewer(CODEX_REVIEW, AgentProvider::Codex),
        planner(CLAUDE_PLAN, AgentProvider::Claude),
        coder(CLAUDE_IMPLEMENT, AgentProvider::Claude),
        reviewer(CLAUDE_REVIEW, AgentProvider::Claude),
    ]
}

fn planner(name: &str, provider: AgentProvider) -> CoreAgent {
    CoreAgent {
        name: name.into(),
        provider,
        role: Some(ROLE_PLANNER.into()),
        model: None,
        system_prompt: None,
        timeout_secs: None,
        max_turns: None,
        origin: AgentOrigin::Builtin,
        linear_context: LinearContextMode::SnapshotPlusMcp,
        mcp_policy: ResolvedMcpPolicy {
            mode: McpMode::Servers,
            servers: vec![LINEAR_MCP_SERVER_NAME.into()],
        },
        tool_policy: ResolvedToolPolicy::default(),
        backend: None,
        runner_mode: None,
        billing_profile: None,
    }
}

fn coder(name: &str, provider: AgentProvider) -> CoreAgent {
    CoreAgent {
        name: name.into(),
        provider,
        role: Some(ROLE_CODER.into()),
        model: None,
        system_prompt: None,
        timeout_secs: None,
        max_turns: None,
        origin: AgentOrigin::Builtin,
        linear_context: LinearContextMode::Snapshot,
        mcp_policy: ResolvedMcpPolicy::default(),
        tool_policy: ResolvedToolPolicy::default(),
        backend: None,
        runner_mode: None,
        billing_profile: None,
    }
}

fn reviewer(name: &str, provider: AgentProvider) -> CoreAgent {
    CoreAgent {
        name: name.into(),
        provider,
        role: Some(ROLE_REVIEWER.into()),
        model: None,
        system_prompt: None,
        timeout_secs: None,
        max_turns: None,
        origin: AgentOrigin::Builtin,
        linear_context: LinearContextMode::None,
        mcp_policy: ResolvedMcpPolicy::default(),
        tool_policy: ResolvedToolPolicy {
            allow: None,
            deny: Some(vec!["bash".into(), "write".into()]),
            require_approval: false,
            persist_results: true,
        },
        backend: None,
        runner_mode: None,
        billing_profile: None,
    }
}

/// Stable name set for validator / tests, derived from
/// [`builtin_definitions`] so the two cannot drift.
#[must_use]
pub fn builtin_names() -> Vec<String> {
    builtin_definitions().into_iter().map(|d| d.name).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn six_builtins_codex_first_then_claude() {
        let defs = builtin_definitions();
        assert_eq!(defs.len(), 6);
        assert_eq!(defs[0].name, CODEX_PLAN);
        assert_eq!(defs[0].provider, AgentProvider::Codex);
        assert_eq!(defs[3].name, CLAUDE_PLAN);
        assert_eq!(defs[3].provider, AgentProvider::Claude);
        assert!(defs.iter().all(|d| d.origin == AgentOrigin::Builtin));
    }

    #[test]
    fn planner_wires_linear_mcp_so_a_fresh_install_can_query_issues() {
        let defs = builtin_definitions();
        let planner = defs
            .iter()
            .find(|d| d.name == CODEX_PLAN)
            .expect("codex planner present");
        assert_eq!(planner.linear_context, LinearContextMode::SnapshotPlusMcp);
        assert_eq!(planner.mcp_policy.mode, McpMode::Servers);
        assert!(
            planner
                .mcp_policy
                .servers
                .iter()
                .any(|s| s == LINEAR_MCP_SERVER_NAME),
            "linear server allowlisted on the planner"
        );
    }

    #[test]
    fn reviewer_denies_destructive_tools() {
        let defs = builtin_definitions();
        let reviewer = defs
            .iter()
            .find(|d| d.name == CODEX_REVIEW)
            .expect("codex reviewer present");
        let deny = reviewer
            .tool_policy
            .deny
            .as_ref()
            .expect("reviewer carries a deny list");
        assert!(deny.iter().any(|t| t == "bash"));
        assert!(deny.iter().any(|t| t == "write"));
    }
}
