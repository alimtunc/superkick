//! Linear context delivery model for routed child agents.
//!
//! Superkick is the project's Linear integrator. Child agents spawned by the
//! role router don't inherit Superkick's Linear credentials or MCP wiring by
//! default. Instead, each role declares how much Linear context it gets:
//!
//! - `none` — role gets no Linear context at all
//! - `snapshot` — a compact, read-only `IssueContext` is injected into the
//!   prompt at spawn time
//! - `snapshot_plus_mcp` — snapshot plus an explicit, role-scoped MCP config
//!   file passed to the provider CLI. No implicit discovery from the worktree
//!   root.
//!
//! The mode is fixed per role in the catalog and resolved at spawn time so the
//! decision is inspectable from the recorded agent session.
//!
//! `IssueContext` is the bounded payload shape. It is intentionally a lossy
//! projection of the full Linear issue — description and comments are
//! truncated — so the prompt stays compact and deterministic.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// How a role receives Linear issue context when spawned.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum LinearContextMode {
    /// No Linear context is delivered. The role sees only the base prompt and
    /// whatever instructions the operator has attached.
    None,
    /// A compact, read-only `IssueContext` is rendered into the prompt. The
    /// role has no live connection to Linear. This is the default.
    #[default]
    Snapshot,
    /// Snapshot plus an explicit role-scoped MCP config pointing at the Linear
    /// MCP server. `--mcp-config` + `--strict-mcp-config` are passed so the
    /// child cannot discover any other MCP source from the worktree.
    SnapshotPlusMcp,
}

impl LinearContextMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Snapshot => "snapshot",
            Self::SnapshotPlusMcp => "snapshot_plus_mcp",
        }
    }

    pub fn includes_snapshot(self) -> bool {
        matches!(self, Self::Snapshot | Self::SnapshotPlusMcp)
    }

    pub fn includes_mcp(self) -> bool {
        matches!(self, Self::SnapshotPlusMcp)
    }
}

impl std::fmt::Display for LinearContextMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for LinearContextMode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "none" => Ok(Self::None),
            "snapshot" => Ok(Self::Snapshot),
            "snapshot_plus_mcp" => Ok(Self::SnapshotPlusMcp),
            other => Err(format!("unknown linear_context_mode '{other}'")),
        }
    }
}

/// Bounded Linear issue snapshot delivered to a child agent. Lossy on purpose
/// — this is a briefing, not a mirror of the Linear record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IssueContext {
    pub id: String,
    pub identifier: String,
    pub title: String,
    pub url: String,
    pub status_name: String,
    pub status_type: String,
    pub priority_label: String,
    pub labels: Vec<String>,
    pub assignee: Option<String>,
    /// Project name, when the issue lives in one.
    pub project: Option<String>,
    pub description: String,
    /// `true` when the description was truncated before inclusion.
    pub description_truncated: bool,
    pub parent: Option<IssueContextParent>,
    pub comments: Vec<IssueContextComment>,
    /// Number of comments received from the Linear API before Superkick's own
    /// truncation — `comments.len()` may be smaller after the
    /// `ISSUE_COMMENT_MAX_COUNT` cap is applied. This is **not** guaranteed to
    /// equal the upstream total if the Linear client ever pages or caps the
    /// response itself.
    pub received_comment_count: u32,
    /// When Superkick built this snapshot.
    pub fetched_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IssueContextParent {
    pub identifier: String,
    pub title: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IssueContextComment {
    pub author: Option<String>,
    pub created_at: DateTime<Utc>,
    pub body: String,
    pub body_truncated: bool,
}

/// Hard caps on snapshot size. Kept small so prompt cost stays bounded even on
/// long-running issues. These are not user-configurable on purpose — a role
/// that needs more should use `snapshot_plus_mcp` and query live.
pub const ISSUE_DESCRIPTION_CHAR_LIMIT: usize = 4_000;
pub const ISSUE_COMMENT_CHAR_LIMIT: usize = 400;
pub const ISSUE_COMMENT_MAX_COUNT: usize = 10;

impl IssueContext {
    /// Render the snapshot into the markdown block injected into agent prompts.
    /// The format is stable and human-readable so the agent can parse it by
    /// inspection.
    pub fn render_for_prompt(&self) -> String {
        let mut out = String::new();
        out.push_str("--- Linear issue snapshot (read-only, fetched by Superkick) ---\n");
        out.push_str(&format!(
            "Issue: {} — {}\n",
            self.identifier,
            self.title.trim()
        ));
        out.push_str(&format!("URL: {}\n", self.url));
        out.push_str(&format!(
            "Status: {} ({}). Priority: {}.\n",
            self.status_name, self.status_type, self.priority_label
        ));
        if !self.labels.is_empty() {
            out.push_str(&format!("Labels: {}\n", self.labels.join(", ")));
        }
        if let Some(assignee) = &self.assignee {
            out.push_str(&format!("Assignee: {assignee}\n"));
        }
        if let Some(project) = &self.project {
            out.push_str(&format!("Project: {project}\n"));
        }
        if let Some(parent) = &self.parent {
            out.push_str(&format!(
                "Parent: {} — {}\n",
                parent.identifier, parent.title
            ));
        }
        out.push_str(&format!("Fetched at: {}\n\n", self.fetched_at.to_rfc3339()));

        out.push_str("Description:\n");
        if self.description.trim().is_empty() {
            out.push_str("(empty)\n");
        } else {
            out.push_str(self.description.trim_end());
            out.push('\n');
            if self.description_truncated {
                out.push_str("[description truncated by Superkick]\n");
            }
        }

        if !self.comments.is_empty() {
            out.push_str(&format!(
                "\nRecent comments ({} of {} fetched):\n",
                self.comments.len(),
                self.received_comment_count
            ));
            for c in &self.comments {
                let author = c.author.as_deref().unwrap_or("unknown");
                out.push_str(&format!("- [{} @ {}] ", author, c.created_at.to_rfc3339()));
                out.push_str(c.body.trim_end());
                out.push('\n');
                if c.body_truncated {
                    out.push_str("  [comment truncated by Superkick]\n");
                }
            }
        }

        out.push_str("--- end snapshot ---");
        out
    }
}

/// Truncate a string to at most `limit` characters on a char boundary.
/// Returns `(possibly truncated copy, was_truncated)`. Exposed so the
/// integrations layer can reuse the exact rule the render code assumes.
pub fn truncate_on_char_boundary(s: &str, limit: usize) -> (String, bool) {
    if s.chars().count() <= limit {
        return (s.to_string(), false);
    }
    let truncated: String = s.chars().take(limit).collect();
    (truncated, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_roundtrips_through_string() {
        for m in [
            LinearContextMode::None,
            LinearContextMode::Snapshot,
            LinearContextMode::SnapshotPlusMcp,
        ] {
            assert_eq!(m.as_str().parse::<LinearContextMode>().unwrap(), m);
        }
    }

    #[test]
    fn mode_flags() {
        assert!(!LinearContextMode::None.includes_snapshot());
        assert!(!LinearContextMode::None.includes_mcp());
        assert!(LinearContextMode::Snapshot.includes_snapshot());
        assert!(!LinearContextMode::Snapshot.includes_mcp());
        assert!(LinearContextMode::SnapshotPlusMcp.includes_snapshot());
        assert!(LinearContextMode::SnapshotPlusMcp.includes_mcp());
    }

    #[test]
    fn render_handles_empty_description_and_no_comments() {
        let ctx = IssueContext {
            id: "abc".into(),
            identifier: "SUP-1".into(),
            title: "Example".into(),
            url: "https://linear.app/x/SUP-1".into(),
            status_name: "In Progress".into(),
            status_type: "started".into(),
            priority_label: "Medium".into(),
            labels: vec![],
            assignee: None,
            project: None,
            description: String::new(),
            description_truncated: false,
            parent: None,
            comments: vec![],
            received_comment_count: 0,
            fetched_at: DateTime::from_timestamp(0, 0).unwrap(),
        };
        let rendered = ctx.render_for_prompt();
        assert!(rendered.contains("SUP-1 — Example"));
        assert!(rendered.contains("(empty)"));
        assert!(!rendered.contains("Recent comments"));
        assert!(rendered.ends_with("--- end snapshot ---"));
    }

    #[test]
    fn render_includes_truncation_markers() {
        let ctx = IssueContext {
            id: "abc".into(),
            identifier: "SUP-2".into(),
            title: "Long issue".into(),
            url: "https://x".into(),
            status_name: "In Progress".into(),
            status_type: "started".into(),
            priority_label: "High".into(),
            labels: vec!["bug".into()],
            assignee: Some("alice".into()),
            project: None,
            description: "hello".into(),
            description_truncated: true,
            parent: None,
            comments: vec![IssueContextComment {
                author: Some("bob".into()),
                created_at: DateTime::from_timestamp(0, 0).unwrap(),
                body: "lgtm".into(),
                body_truncated: true,
            }],
            received_comment_count: 12,
            fetched_at: DateTime::from_timestamp(0, 0).unwrap(),
        };
        let rendered = ctx.render_for_prompt();
        assert!(rendered.contains("[description truncated by Superkick]"));
        assert!(rendered.contains("[comment truncated by Superkick]"));
        assert!(rendered.contains("Recent comments (1 of 12 fetched)"));
        assert!(rendered.contains("Labels: bug"));
        assert!(rendered.contains("Assignee: alice"));
    }

    #[test]
    fn truncate_on_char_boundary_handles_unicode() {
        let s = "héllo";
        let (t, was) = truncate_on_char_boundary(s, 3);
        assert_eq!(t, "hél");
        assert!(was);

        let (t, was) = truncate_on_char_boundary(s, 10);
        assert_eq!(t, "héllo");
        assert!(!was);
    }
}
