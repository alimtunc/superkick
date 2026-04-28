//! Linear-specific glue around the role-scoped MCP policy (SUP-86, SUP-104).
//!
//! Two responsibilities, both narrow:
//!
//! 1. Fetch a bounded `IssueContext` snapshot for a run at spawn time
//!    through the shared `LinearClient`. Without a client, any role
//!    requesting `snapshot` or `snapshot_plus_mcp` downgrades to `none`
//!    with a warning so a missing `LINEAR_API_KEY` never blocks a run.
//!
//! 2. Carry the read-only directive appended to the prompt when MCP is
//!    wired against Linear, so the child explicitly understands that no
//!    write tools may be called.
//!
//! All MCP file generation now lives in
//! [`crate::mcp_policy`](super::mcp_policy) — the legacy
//! `linear_context: snapshot_plus_mcp` shortcut just adds `linear` to
//! the resolved server allowlist at config-load time.

use std::sync::Arc;

use anyhow::{Context, Result};
use superkick_core::IssueContext;

use superkick_integrations::linear::{LinearClient, issue_context_from_detail};

/// Strong instruction appended to the snapshot prompt when MCP is wired
/// against the Linear server, so the child agent stays explicit about
/// not performing write operations against Linear.
pub const MCP_READONLY_DIRECTIVE: &str = "IMPORTANT: You have read-only access to the Linear MCP. \
You MUST NOT call any tool that writes to Linear (no create/update/delete of issues, comments, \
labels, projects, cycles, or state). Use MCP only to look up additional context.";

/// Fetch the bounded snapshot for one issue via the shared Linear client.
pub async fn fetch_issue_context(client: &LinearClient, issue_id: &str) -> Result<IssueContext> {
    let detail = client
        .get_issue(issue_id)
        .await
        .with_context(|| format!("failed to fetch Linear issue {issue_id} for context"))?;
    Ok(issue_context_from_detail(&detail))
}

/// Optional client handle — `None` in test setups and when `LINEAR_API_KEY`
/// is unset at boot. Stored as `Arc` so the supervisor can clone cheaply.
pub type OptionalLinearClient = Option<Arc<LinearClient>>;
