//! Per-role MCP config materialisation (SUP-104).
//!
//! This module owns the on-disk artefact and the provider CLI flags that
//! tell a child agent "use exactly these MCP servers, nothing else." It
//! is provider-agnostic — Linear is just one possible entry in the
//! per-role allowlist.
//!
//! Two responsibilities:
//!
//! 1. Resolve a [`ResolvedMcpPolicy`] (server *names*) into a concrete
//!    [`Vec<McpServerEntry>`] by joining the names with the project's
//!    `mcp_servers` registry. Unknown names are dropped with a warning so
//!    a typo in one role never hangs the whole run.
//!
//! 2. Render those entries into a Claude-compatible `mcpServers` JSON
//!    file under `<worktree>/.superkick/`, plus the CLI args
//!    `--mcp-config <path> --strict-mcp-config`. Codex has no equivalent
//!    flag in v1 — see [`mcp_cli_args_for_provider`] for the no-op path.
//!
//! No secret value is ever persisted in the audit row. The on-disk file
//! does contain resolved env values (Claude needs them to authenticate)
//! but it lives under `.superkick/` inside the worktree, which is
//! gitignored. Callers should treat the file path as ephemeral.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Serialize;
use superkick_config::McpServerSpec;
use superkick_core::{AgentProvider, ResolvedMcpPolicy};

/// One MCP server resolved against the project registry, ready to be
/// rendered into the on-disk config.
///
/// `name` is the registry key — also the audit value persisted on the
/// agent session. The variant carries whatever the provider needs to
/// reach the server.
#[derive(Debug, Clone)]
pub struct McpServerEntry {
    pub name: String,
    pub kind: McpServerEntryKind,
}

/// Concrete connection details for one server entry.
#[derive(Debug, Clone)]
pub enum McpServerEntryKind {
    /// Remote HTTP MCP. `env` carries any resolved env passthrough — for
    /// the hosted Linear MCP this is empty (auth rides on the URL via
    /// the user's OAuth session).
    Http {
        url: String,
        env: HashMap<String, String>,
    },
    /// Local stdio MCP. `env` is the passthrough resolved from the
    /// supervisor's environment at spawn time; values are never persisted
    /// on the audit row.
    Stdio {
        command: String,
        args: Vec<String>,
        env: HashMap<String, String>,
    },
}

/// Where a per-role MCP config was written, plus the provider CLI args
/// needed so the child uses exactly that file.
#[derive(Debug, Clone)]
pub struct McpConfigArtifact {
    pub path: PathBuf,
    /// Server names actually present in the file. This becomes the
    /// `mcp_servers_used` audit value.
    pub server_names: Vec<String>,
    pub cli_args: Vec<String>,
}

/// JSON schema written to disk for Claude. Intentionally minimal — only
/// the fields Claude's MCP loader honours.
#[derive(Debug, Serialize)]
struct McpConfigFile {
    #[serde(rename = "mcpServers")]
    mcp_servers: std::collections::BTreeMap<String, McpServerJson>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum McpServerJson {
    Http {
        #[serde(rename = "type")]
        kind: &'static str,
        url: String,
    },
    Stdio {
        command: String,
        #[serde(skip_serializing_if = "Vec::is_empty")]
        args: Vec<String>,
        #[serde(skip_serializing_if = "HashMap::is_empty")]
        env: HashMap<String, String>,
    },
}

/// Resolution outcome for one role's MCP policy.
#[derive(Debug, Clone, Default)]
pub struct ResolvedMcpServers {
    /// Servers actually wired (post-degradation). Becomes `mcp_servers_used`.
    pub entries: Vec<McpServerEntry>,
    /// Server names listed in the role policy but absent from the registry.
    /// Reported but not fatal — the run still spawns.
    pub missing: Vec<String>,
}

/// Resolve a role's [`ResolvedMcpPolicy`] against the project registry.
///
/// Names listed by the role but absent from the registry are dropped
/// (and reported via `missing`) rather than failing the spawn — a typo
/// in one role should not take down the run. Stdio env passthrough is
/// resolved here so the on-disk file carries the values the child needs.
///
/// Returns an empty result when the policy is `none` or the role's
/// allowlist is empty after intersection.
pub fn resolve_servers(
    policy: &ResolvedMcpPolicy,
    registry: &HashMap<String, McpServerSpec>,
) -> ResolvedMcpServers {
    if !policy.is_active() {
        return ResolvedMcpServers::default();
    }
    let mut entries: Vec<McpServerEntry> = Vec::new();
    let mut missing: Vec<String> = Vec::new();
    for name in &policy.servers {
        match registry.get(name) {
            Some(spec) => entries.push(materialise(name, spec)),
            None => missing.push(name.clone()),
        }
    }
    ResolvedMcpServers { entries, missing }
}

fn materialise(name: &str, spec: &McpServerSpec) -> McpServerEntry {
    let kind = match spec {
        McpServerSpec::Http {
            url,
            env_passthrough,
        } => McpServerEntryKind::Http {
            url: url.clone(),
            env: resolve_env(env_passthrough),
        },
        McpServerSpec::Stdio {
            command,
            args,
            env_passthrough,
        } => McpServerEntryKind::Stdio {
            command: command.clone(),
            args: args.clone(),
            env: resolve_env(env_passthrough),
        },
    };
    McpServerEntry {
        name: name.to_string(),
        kind,
    }
}

/// Resolve env passthrough names against the supervisor's environment.
///
/// Missing or empty values are silently skipped — the child will treat
/// the variable as unset, same as if Superkick had not been involved.
/// A non-unicode value is also skipped, but is logged at `warn` so the
/// operator sees that an MCP-bound credential failed to materialise.
fn resolve_env(names: &[String]) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for name in names {
        match std::env::var(name) {
            Ok(value) if !value.is_empty() => {
                out.insert(name.clone(), value);
            }
            Ok(_) | Err(std::env::VarError::NotPresent) => {}
            Err(std::env::VarError::NotUnicode(_)) => {
                tracing::warn!(
                    env = %name,
                    "MCP env passthrough value is not valid unicode — dropping"
                );
            }
        }
    }
    out
}

/// Provider-specific CLI args appended after the MCP file is written.
///
/// Claude honours `--mcp-config` plus `--strict-mcp-config` so the child
/// cannot discover any additional MCP source from the worktree or the
/// user's home directory. Codex has no equivalent in v1 — we log a
/// warning at the call site and append no flag, with the agent session
/// audit row honestly reflecting `mcp_servers_used = []`.
pub fn mcp_cli_args_for_provider(provider: AgentProvider, path: &Path) -> Option<Vec<String>> {
    match provider {
        AgentProvider::Claude => Some(vec![
            "--mcp-config".to_string(),
            path.to_string_lossy().into_owned(),
            "--strict-mcp-config".to_string(),
        ]),
        AgentProvider::Codex => None,
    }
}

/// Write a per-role MCP config file under `<worktree>/.superkick/`.
///
/// `role_name` and `session_suffix` are sanitized into the filename so
/// concurrent roles never clobber each other's config. The parent
/// directory is created on demand. Returns the path, the server names
/// actually written, and the provider CLI args (Claude only).
pub async fn write_role_mcp_config(
    worktree: &Path,
    provider: AgentProvider,
    role_name: &str,
    session_suffix: &str,
    entries: &[McpServerEntry],
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
    let mut server_names = Vec::with_capacity(entries.len());
    for entry in entries {
        server_names.push(entry.name.clone());
        let json = match &entry.kind {
            McpServerEntryKind::Http { url, env: _ } => McpServerJson::Http {
                kind: "http",
                url: url.clone(),
            },
            McpServerEntryKind::Stdio { command, args, env } => McpServerJson::Stdio {
                command: command.clone(),
                args: args.clone(),
                env: env.clone(),
            },
        };
        servers.insert(entry.name.clone(), json);
    }
    let doc = McpConfigFile {
        mcp_servers: servers,
    };
    let body = serde_json::to_string_pretty(&doc).context("failed to render MCP config")?;
    tokio::fs::write(&path, body)
        .await
        .with_context(|| format!("failed to write {}", path.display()))?;

    let cli_args = mcp_cli_args_for_provider(provider, &path).unwrap_or_default();
    Ok(McpConfigArtifact {
        path,
        server_names,
        cli_args,
    })
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
    use serial_test::serial;
    use superkick_core::McpMode;
    use tempfile::tempdir;

    fn http(url: &str) -> McpServerSpec {
        McpServerSpec::Http {
            url: url.into(),
            env_passthrough: Vec::new(),
        }
    }

    fn registry_with_linear() -> HashMap<String, McpServerSpec> {
        let mut r = HashMap::new();
        r.insert("linear".into(), http("https://mcp.linear.app/mcp"));
        r
    }

    #[test]
    fn resolve_servers_returns_empty_for_mode_none() {
        let policy = ResolvedMcpPolicy {
            mode: McpMode::None,
            servers: vec!["linear".into()],
        };
        let resolved = resolve_servers(&policy, &registry_with_linear());
        assert!(resolved.entries.is_empty());
        assert!(resolved.missing.is_empty());
    }

    #[test]
    fn resolve_servers_intersects_with_registry() {
        let policy = ResolvedMcpPolicy {
            mode: McpMode::Servers,
            servers: vec!["linear".into(), "ghost".into()],
        };
        let resolved = resolve_servers(&policy, &registry_with_linear());
        assert_eq!(resolved.entries.len(), 1);
        assert_eq!(resolved.entries[0].name, "linear");
        assert_eq!(resolved.missing, vec!["ghost".to_string()]);
    }

    #[test]
    fn cli_args_returned_for_claude_only() {
        let p = Path::new("/tmp/mcp.json");
        let claude = mcp_cli_args_for_provider(AgentProvider::Claude, p).unwrap();
        assert!(claude.contains(&"--mcp-config".to_string()));
        assert!(claude.contains(&"--strict-mcp-config".to_string()));

        let codex = mcp_cli_args_for_provider(AgentProvider::Codex, p);
        assert!(codex.is_none(), "Codex must not get an MCP flag in v1");
    }

    #[tokio::test]
    async fn writes_file_with_multiple_servers_and_returns_names() {
        let tmp = tempdir().expect("tempdir");
        let entries = vec![
            McpServerEntry {
                name: "linear".into(),
                kind: McpServerEntryKind::Http {
                    url: "https://mcp.linear.app/mcp".into(),
                    env: HashMap::new(),
                },
            },
            McpServerEntry {
                name: "fs".into(),
                kind: McpServerEntryKind::Stdio {
                    command: "mcp-fs".into(),
                    args: vec!["--root".into(), "/tmp".into()],
                    env: HashMap::new(),
                },
            },
        ];

        let artifact = write_role_mcp_config(
            tmp.path(),
            AgentProvider::Claude,
            "planner",
            "abc-123",
            &entries,
        )
        .await
        .expect("write artifact");

        assert!(artifact.path.exists());
        assert!(artifact.path.starts_with(tmp.path().join(".superkick")));
        assert_eq!(artifact.server_names, vec!["linear", "fs"]);
        assert!(
            artifact
                .cli_args
                .contains(&"--strict-mcp-config".to_string())
        );

        let body = std::fs::read_to_string(&artifact.path).unwrap();
        assert!(body.contains("\"linear\""));
        assert!(body.contains("\"fs\""));
        assert!(body.contains("https://mcp.linear.app/mcp"));
        assert!(body.contains("\"command\": \"mcp-fs\""));
    }

    #[tokio::test]
    async fn codex_writes_file_but_no_cli_flag() {
        let tmp = tempdir().expect("tempdir");
        let entries = vec![McpServerEntry {
            name: "linear".into(),
            kind: McpServerEntryKind::Http {
                url: "https://mcp.linear.app/mcp".into(),
                env: HashMap::new(),
            },
        }];
        let artifact =
            write_role_mcp_config(tmp.path(), AgentProvider::Codex, "reviewer", "z", &entries)
                .await
                .unwrap();
        assert!(artifact.cli_args.is_empty());
    }

    #[tokio::test]
    #[serial]
    async fn env_refs_in_spec_are_not_persisted_in_audit() {
        // Even when stdio env_passthrough resolves a value, the audit
        // (the artifact's `server_names`) only carries the name.
        let tmp = tempdir().expect("tempdir");
        unsafe {
            std::env::set_var("SUP104_TEST_TOKEN", "secret-do-not-leak");
        }
        let env_passthrough = vec!["SUP104_TEST_TOKEN".into()];
        let resolved = resolve_env(&env_passthrough);
        assert_eq!(
            resolved.get("SUP104_TEST_TOKEN").map(String::as_str),
            Some("secret-do-not-leak")
        );

        let entries = vec![McpServerEntry {
            name: "stdio-server".into(),
            kind: McpServerEntryKind::Stdio {
                command: "mcp".into(),
                args: vec![],
                env: resolved,
            },
        }];
        let artifact = write_role_mcp_config(tmp.path(), AgentProvider::Claude, "r", "s", &entries)
            .await
            .unwrap();

        // The on-disk file *does* carry the resolved value (Claude needs
        // it to authenticate), but the audit names list never includes
        // it — that's the only thing persisted in the database.
        assert_eq!(artifact.server_names, vec!["stdio-server"]);

        unsafe {
            std::env::remove_var("SUP104_TEST_TOKEN");
        }
    }
}
