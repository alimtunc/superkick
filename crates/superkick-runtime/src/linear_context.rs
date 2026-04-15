//! Runtime glue for the per-role Linear context delivery model (SUP-86).
//!
//! Two responsibilities:
//!
//! 1. Fetch a bounded `IssueContext` snapshot for a run at spawn time through
//!    the shared `LinearClient`. The engine can be built without a client; in
//!    that case any role configured for `snapshot` or `snapshot_plus_mcp`
//!    downgrades to `none` with a warning, so runs never block on missing
//!    Linear credentials.
//!
//! 2. Materialise a role-scoped MCP config on disk when the role opts into
//!    `snapshot_plus_mcp`. The file is written under the worktree's
//!    `.superkick/` directory and its path is passed to Claude with
//!    `--mcp-config` + `--strict-mcp-config` so the child process cannot
//!    discover any other MCP source. No implicit copy of the repo-root
//!    `.mcp.json` ever happens.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result};
use serde::Serialize;
use superkick_core::IssueContext;

use superkick_integrations::linear::{LinearClient, issue_context_from_detail};

/// URL of the Linear MCP server. Read-only scope is expected to be enforced at
/// the token level by the user's Linear OAuth configuration; the
/// `MCP_READONLY_DIRECTIVE` copy in the prompt is the belt-and-braces signal
/// to the child agent itself.
const LINEAR_MCP_URL: &str = "https://mcp.linear.app/mcp";

/// Strong instruction appended to the snapshot prompt when MCP is wired, so
/// the child agent is explicit about not performing write operations against
/// Linear.
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

/// Optional client handle — `None` in test setups and when `LINEAR_API_KEY` is
/// unset at boot. Stored as `Arc` so the supervisor can clone cheaply.
pub type OptionalLinearClient = Option<Arc<LinearClient>>;

/// Where a role-scoped MCP config was written, plus the CLI flags needed so a
/// Claude child process uses exactly that config and nothing else.
#[derive(Debug, Clone)]
pub struct McpConfigArtifact {
    pub path: PathBuf,
    /// Extra CLI args to append, in order.
    pub cli_args: Vec<String>,
}

/// Shape of the MCP config we write for roles with live Linear access.
/// Intentionally small — exactly one server, the Linear MCP endpoint.
#[derive(Debug, Serialize)]
struct McpConfigFile {
    #[serde(rename = "mcpServers")]
    mcp_servers: std::collections::BTreeMap<String, McpServerEntry>,
}

#[derive(Debug, Serialize)]
struct McpServerEntry {
    #[serde(rename = "type")]
    kind: &'static str,
    url: String,
}

/// Write a role-scoped MCP config file under `<worktree>/.superkick/` and
/// return the path plus the CLI args to point Claude at it.
///
/// The filename carries the role and a caller-supplied unique suffix (usually
/// the agent session id) so concurrent roles do not clobber each other's
/// config. The parent directory is created on demand.
pub async fn write_role_mcp_config(
    worktree: &Path,
    role_name: &str,
    session_suffix: &str,
) -> Result<McpConfigArtifact> {
    let dir = worktree.join(".superkick");
    tokio::fs::create_dir_all(&dir)
        .await
        .with_context(|| format!("failed to create {}", dir.display()))?;

    let safe_role = sanitize_for_filename(role_name);
    let safe_suffix = sanitize_for_filename(session_suffix);
    let filename = format!("mcp-{safe_role}-{safe_suffix}.json");
    let path = dir.join(filename);

    let mut servers = std::collections::BTreeMap::new();
    servers.insert(
        "linear".to_string(),
        McpServerEntry {
            kind: "http",
            url: LINEAR_MCP_URL.to_string(),
        },
    );
    let doc = McpConfigFile {
        mcp_servers: servers,
    };

    let json = serde_json::to_string_pretty(&doc).context("failed to render MCP config")?;
    tokio::fs::write(&path, json)
        .await
        .with_context(|| format!("failed to write {}", path.display()))?;

    let cli_args = vec![
        "--mcp-config".to_string(),
        path.to_string_lossy().into_owned(),
        "--strict-mcp-config".to_string(),
    ];

    Ok(McpConfigArtifact { path, cli_args })
}

fn sanitize_for_filename(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn writes_mcp_config_to_worktree_and_emits_strict_flag() {
        let tmp = tempdir().unwrap();
        let artifact = write_role_mcp_config(tmp.path(), "planner", "abc123")
            .await
            .expect("write artifact");
        assert!(artifact.path.exists());
        assert!(artifact.path.starts_with(tmp.path().join(".superkick")));
        assert_eq!(
            artifact.cli_args,
            vec![
                "--mcp-config".to_string(),
                artifact.path.to_string_lossy().into_owned(),
                "--strict-mcp-config".to_string(),
            ]
        );

        let body = std::fs::read_to_string(&artifact.path).unwrap();
        assert!(body.contains("\"linear\""));
        assert!(body.contains(LINEAR_MCP_URL));
        assert!(body.contains("\"type\": \"http\""));
    }

    #[tokio::test]
    async fn sanitizes_role_name_in_filename() {
        let tmp = tempdir().unwrap();
        let artifact = write_role_mcp_config(tmp.path(), "plan/ner ../../evil", "s")
            .await
            .unwrap();
        let name = artifact.path.file_name().unwrap().to_string_lossy();
        assert!(!name.contains('/'));
        assert!(!name.contains(' '));
        assert!(!name.contains(".."));
    }

    struct TempDir {
        path: PathBuf,
    }

    impl TempDir {
        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }

    fn tempdir() -> Result<TempDir> {
        let base = std::env::temp_dir();
        let unique = format!("sup86-{}", uuid::Uuid::new_v4());
        let path = base.join(unique);
        std::fs::create_dir_all(&path)?;
        Ok(TempDir { path })
    }
}
