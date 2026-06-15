//! Superkick-shipped agent defaults — the "Codex-first" catalog.
//!
//! The canonical definitions now live in `superkick-core`
//! ([`CoreAgentDefinition::builtins`]); this module re-exports the stable
//! names and a thin `Vec`-returning wrapper so the config crate (and its
//! `agent_catalog`/`validate` callers) keep their existing surface. A custom
//! entry in `superkick.yaml` with the same name overrides the built-in (see
//! [`crate::SuperkickConfig::agent_catalog`]).

use superkick_core::CoreAgentDefinition as CoreAgent;

/// Every built-in role, in stable picker order (Codex first, then Claude;
/// plan → implement → review within each provider).
#[must_use]
pub fn builtin_definitions() -> Vec<CoreAgent> {
    CoreAgent::builtins()
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
    use crate::model::LINEAR_MCP_SERVER_NAME;
    use superkick_core::{
        AgentOrigin, AgentProvider, CLAUDE_PLAN, CODEX_PLAN, CODEX_REVIEW, McpMode,
    };

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
        assert_eq!(planner.mcp_policy.mode, McpMode::Servers);
        // Guards the config-side registry key against the core builtin drifting.
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
    fn builtins_attach_their_skill_and_an_avatar() {
        for def in builtin_definitions() {
            assert!(
                !def.skills.is_empty(),
                "builtin `{}` attaches at least one skill",
                def.name
            );
            assert!(
                def.avatar.is_some(),
                "builtin `{}` ships a default avatar",
                def.name
            );
        }
        let planner = builtin_definitions()
            .into_iter()
            .find(|d| d.name == CODEX_PLAN)
            .expect("codex planner present");
        assert_eq!(planner.skills, vec!["plan".to_string()]);
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
