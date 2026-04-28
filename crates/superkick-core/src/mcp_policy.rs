//! Per-agent MCP and tool policy as projected into the core domain.
//!
//! Superkick spawns child agents with **no** MCP wiring by default. A role
//! that wants live MCP access must declare it explicitly via the project's
//! `mcp_servers` registry plus an `mcp` policy block on the agent. This
//! module owns the resolved shape consumed by the role router and the
//! runtime — the YAML-facing types live in `superkick-config`.
//!
//! Two policies are tracked per role:
//!
//! 1. [`ResolvedMcpPolicy`] — which MCP servers from the registry the role is
//!    allowed to talk to at spawn time. The runtime joins these names with
//!    the registry to materialise the per-role MCP config file.
//! 2. [`ResolvedToolPolicy`] — informational tool allow/deny + the two
//!    booleans recorded on the [`AgentSession`](crate::AgentSession) audit
//!    row (`tool_approval_required`, `tool_results_persisted`). Enforcement
//!    of allow/deny is provider-specific and out of scope for v1.
//!
//! The legacy `linear_context: snapshot_plus_mcp` sugar is desugared by
//! `superkick-config`'s `agent_catalog()` builder so that the resolved
//! policy already contains the implicit `linear` server. The core domain
//! never sees the sugar — it sees the desugared policy only.

use serde::{Deserialize, Serialize};

/// How a role accesses MCP servers at spawn time.
///
/// Default is [`McpMode::None`] — no MCP file is generated and no
/// `--mcp-config` flag is appended to the provider command. A role must
/// explicitly opt-in to `Servers` mode and list which registry entries it
/// is allowed to use.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum McpMode {
    /// No MCP wiring. The child sees no `mcpServers` config and the strict
    /// flag is **not** appended — strict-without-config breaks Claude.
    #[default]
    None,
    /// MCP wiring restricted to the named entries from the project's
    /// `mcp_servers` registry. The runtime writes a role-scoped file under
    /// `<worktree>/.superkick/` and passes
    /// `--mcp-config <path> --strict-mcp-config` so the child cannot
    /// discover any other MCP source.
    Servers,
}

impl McpMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Servers => "servers",
        }
    }
}

impl std::fmt::Display for McpMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Resolved MCP policy attached to a role at catalog-build time.
///
/// `servers` is a whitelist of names that must exist in the project's
/// `mcp_servers` registry. The runtime intersects this list with the
/// registry; unknown names are dropped with a warning rather than failing
/// the spawn so that a typo in one role doesn't take down a whole run.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResolvedMcpPolicy {
    pub mode: McpMode,
    pub servers: Vec<String>,
}

impl ResolvedMcpPolicy {
    /// `true` when the policy resolves to at least one MCP server. Used by
    /// the runtime to decide whether to write the per-role MCP file.
    pub fn is_active(&self) -> bool {
        matches!(self.mode, McpMode::Servers) && !self.servers.is_empty()
    }
}

/// Resolved tool policy attached to a role.
///
/// v1 records the policy on the audit row; provider-side enforcement is
/// best-effort and lives behind whatever flags the provider CLI happens
/// to expose. Future versions can layer enforcement on top without
/// breaking the audit shape.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ResolvedToolPolicy {
    /// Allow-list of tool names. `None` means "no restriction"; an empty
    /// `Some(vec![])` means "deny everything".
    pub allow: Option<Vec<String>>,
    /// Deny-list of tool names. Always intersected with `allow` when both
    /// are set.
    pub deny: Option<Vec<String>>,
    /// Tool calls require explicit human approval before execution.
    pub require_approval: bool,
    /// Tool result payloads are persisted for audit. Default-on so the
    /// run log stays inspectable; set to `false` when the role handles
    /// secrets the operator does not want stored.
    pub persist_results: bool,
}

impl ResolvedToolPolicy {
    /// Snapshot of the allowlist for the audit row. Returns `None` when
    /// the role places no restriction (i.e. no allowlist at all).
    pub fn allow_snapshot(&self) -> Option<Vec<String>> {
        self.allow.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mcp_mode_default_is_none() {
        assert_eq!(McpMode::default(), McpMode::None);
    }

    #[test]
    fn mcp_policy_default_is_inactive() {
        let p = ResolvedMcpPolicy::default();
        assert!(!p.is_active());
        assert_eq!(p.mode, McpMode::None);
        assert!(p.servers.is_empty());
    }

    #[test]
    fn mcp_policy_active_requires_mode_and_servers() {
        let only_mode = ResolvedMcpPolicy {
            mode: McpMode::Servers,
            servers: vec![],
        };
        assert!(!only_mode.is_active());

        let only_servers = ResolvedMcpPolicy {
            mode: McpMode::None,
            servers: vec!["linear".into()],
        };
        assert!(!only_servers.is_active());

        let both = ResolvedMcpPolicy {
            mode: McpMode::Servers,
            servers: vec!["linear".into()],
        };
        assert!(both.is_active());
    }

    #[test]
    fn tool_policy_allow_snapshot_round_trips() {
        let p = ResolvedToolPolicy {
            allow: Some(vec!["read".into()]),
            deny: None,
            require_approval: true,
            persist_results: false,
        };
        assert_eq!(p.allow_snapshot(), Some(vec!["read".into()]));

        let unrestricted = ResolvedToolPolicy::default();
        assert_eq!(unrestricted.allow_snapshot(), None);
    }
}
