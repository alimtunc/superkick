//! Issue workspace context aggregate — SUP-147.
//!
//! Persistent, per-Linear-issue workspace: a frozen snapshot of the issue at
//! attach time, operator-selected comment excerpts, links to spawned Launch
//! Tasks / runs / conversations, and an opaque memory ledger pointer (typed
//! in sub-ticket 2).
//!
//! The snapshot is immutable post-construction: Linear is the source of truth
//! for the *current* issue state; this aggregate preserves what the operator
//! saw when they decided to start working. Distinct from
//! `linear_context::IssueContext`, which is the bounded projection fed into
//! agent prompts.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::id::{
    IssueWorkspaceContextCommentExcerptId, IssueWorkspaceContextId, IssueWorkspaceContextLinkId,
};

/// What an `IssueWorkspaceContextLink` points at.
///
/// Variants are added back-compat — the column is a CHECK-constrained TEXT
/// and a fresh variant ships with a migration. Sub-ticket 3+ may add
/// `Step` / `OrchestratorSession`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueWorkspaceContextLinkKind {
    LaunchTask,
    Run,
    Conversation,
}

impl std::fmt::Display for IssueWorkspaceContextLinkKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::LaunchTask => "launch_task",
            Self::Run => "run",
            Self::Conversation => "conversation",
        };
        f.write_str(s)
    }
}

/// One operator-selected comment kept on the workspace. `linear_comment_id`
/// is intentionally not unique across contexts — the same Linear comment can
/// be attached to multiple workspaces (e.g. when an issue is re-launched
/// later and the operator wants the same conversational pin).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueWorkspaceContextCommentExcerpt {
    pub id: IssueWorkspaceContextCommentExcerptId,
    pub workspace_context_id: IssueWorkspaceContextId,
    pub linear_comment_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    pub body_md: String,
    pub captured_at: DateTime<Utc>,
}

/// Polymorphic pointer to another aggregate spawned from the issue.
///
/// `target_id` is a plain TEXT with no SQL FK on purpose — the same rationale
/// as `launch_task_steps.linked_run_id` (cf. SUP-121): the target tables
/// (runs, launch_tasks, conversations) live in different cardinalities and
/// the integrity check belongs to the caller that owns both ids.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueWorkspaceContextLink {
    pub id: IssueWorkspaceContextLinkId,
    pub workspace_context_id: IssueWorkspaceContextId,
    pub link_kind: IssueWorkspaceContextLinkKind,
    pub target_id: String,
    pub attached_at: DateTime<Utc>,
}

/// Frozen snapshot taken at attach time. Once `IssueWorkspaceContext::new`
/// returns, no public API mutates `snapshot_title` / `snapshot_body_md` /
/// `snapshot_status_name` / `captured_at`. That immutability is the *whole
/// point* of this aggregate — the absence of setters is the enforcement
/// mechanism, exactly like `LaunchTask` enforces "no manual status edits"
/// by routing every change through `transition_to`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueWorkspaceContext {
    pub id: IssueWorkspaceContextId,

    pub linear_team_key: String,
    pub linear_issue_identifier: String,
    pub linear_issue_id: String,

    pub snapshot_title: String,
    pub snapshot_body_md: String,
    pub snapshot_status_name: String,
    pub captured_at: DateTime<Utc>,

    /// Opaque pointer to the memory ledger row backing this workspace. Sub-
    /// ticket 2 (SUP-148+) will introduce a typed `MemoryLedgerId`; storing
    /// it as `String` here keeps the migration boundary in that ticket
    /// rather than dragging it forward speculatively.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub memory_ledger_pointer: Option<String>,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Inputs needed to attach a workspace to a Linear issue. A struct beats a
/// six-positional-`String` constructor; every field has a name at the call
/// site.
#[derive(Debug, Clone)]
pub struct IssueWorkspaceContextSnapshot {
    pub linear_team_key: String,
    pub linear_issue_identifier: String,
    pub linear_issue_id: String,
    pub snapshot_title: String,
    pub snapshot_body_md: String,
    pub snapshot_status_name: String,
}

impl IssueWorkspaceContext {
    /// Build a workspace from a fresh snapshot and a (possibly empty) initial
    /// set of comment excerpts and links. The only validation we do is "the
    /// Linear identifiers actually identify something" — everything else
    /// (title, body, status name) is opaque text we faithfully persist.
    pub fn new(
        snapshot: IssueWorkspaceContextSnapshot,
        excerpts: Vec<NewCommentExcerpt>,
        links: Vec<NewLink>,
    ) -> Result<
        (
            Self,
            Vec<IssueWorkspaceContextCommentExcerpt>,
            Vec<IssueWorkspaceContextLink>,
        ),
        CoreError,
    > {
        if snapshot.linear_team_key.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "issue workspace context linear_team_key must not be empty".into(),
            ));
        }
        if snapshot.linear_issue_identifier.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "issue workspace context linear_issue_identifier must not be empty".into(),
            ));
        }
        if snapshot.linear_issue_id.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "issue workspace context linear_issue_id must not be empty".into(),
            ));
        }

        let now = Utc::now();
        let id = IssueWorkspaceContextId::new();

        let context = IssueWorkspaceContext {
            id,
            linear_team_key: snapshot.linear_team_key,
            linear_issue_identifier: snapshot.linear_issue_identifier,
            linear_issue_id: snapshot.linear_issue_id,
            snapshot_title: snapshot.snapshot_title,
            snapshot_body_md: snapshot.snapshot_body_md,
            snapshot_status_name: snapshot.snapshot_status_name,
            captured_at: now,
            memory_ledger_pointer: None,
            created_at: now,
            updated_at: now,
        };

        let mut seen_links: std::collections::HashSet<(IssueWorkspaceContextLinkKind, String)> =
            std::collections::HashSet::new();
        let mut materialised_links = Vec::with_capacity(links.len());
        for link in links {
            let key = (link.link_kind, link.target_id.clone());
            if !seen_links.insert(key) {
                return Err(CoreError::InvalidInput(format!(
                    "duplicate link {} -> {} in initial workspace context links",
                    link.link_kind, link.target_id
                )));
            }
            materialised_links.push(IssueWorkspaceContextLink {
                id: IssueWorkspaceContextLinkId::new(),
                workspace_context_id: id,
                link_kind: link.link_kind,
                target_id: link.target_id,
                attached_at: now,
            });
        }

        let materialised_excerpts = excerpts
            .into_iter()
            .map(|e| IssueWorkspaceContextCommentExcerpt {
                id: IssueWorkspaceContextCommentExcerptId::new(),
                workspace_context_id: id,
                linear_comment_id: e.linear_comment_id,
                author: e.author,
                body_md: e.body_md,
                captured_at: now,
            })
            .collect();

        Ok((context, materialised_excerpts, materialised_links))
    }

    /// Replace the memory ledger pointer (or clear it with `None`). Bumps
    /// `updated_at`; the snapshot fields remain untouched.
    pub fn set_memory_ledger_pointer(&mut self, pointer: Option<String>) {
        self.memory_ledger_pointer = pointer;
        self.updated_at = Utc::now();
    }
}

/// Caller-supplied payload for one comment excerpt. Kept distinct from the
/// persisted struct so the caller does not have to mint ids the aggregate
/// owns.
#[derive(Debug, Clone)]
pub struct NewCommentExcerpt {
    pub linear_comment_id: String,
    pub author: Option<String>,
    pub body_md: String,
}

/// Caller-supplied payload for one link.
#[derive(Debug, Clone)]
pub struct NewLink {
    pub link_kind: IssueWorkspaceContextLinkKind,
    pub target_id: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_snapshot() -> IssueWorkspaceContextSnapshot {
        IssueWorkspaceContextSnapshot {
            linear_team_key: "SUP".into(),
            linear_issue_identifier: "SUP-147".into(),
            linear_issue_id: "issue-uuid-147".into(),
            snapshot_title: "IssueWorkspaceContext".into(),
            snapshot_body_md: "Full body of the issue\n\nWith newlines.".into(),
            snapshot_status_name: "In Progress".into(),
        }
    }

    #[test]
    fn new_persists_snapshot_verbatim() {
        let (ctx, excerpts, links) =
            IssueWorkspaceContext::new(sample_snapshot(), vec![], vec![]).expect("valid snapshot");
        assert_eq!(ctx.snapshot_title, "IssueWorkspaceContext");
        assert_eq!(
            ctx.snapshot_body_md,
            "Full body of the issue\n\nWith newlines."
        );
        assert_eq!(ctx.snapshot_status_name, "In Progress");
        assert_eq!(ctx.linear_issue_identifier, "SUP-147");
        assert!(excerpts.is_empty());
        assert!(links.is_empty());
        assert!(ctx.memory_ledger_pointer.is_none());
    }

    #[test]
    fn new_rejects_empty_linear_identifier() {
        let mut snapshot = sample_snapshot();
        snapshot.linear_issue_identifier = "   ".into();
        let err = IssueWorkspaceContext::new(snapshot, vec![], vec![])
            .expect_err("empty identifier must be rejected");
        match err {
            CoreError::InvalidInput(msg) => {
                assert!(msg.contains("linear_issue_identifier"), "msg = {msg}")
            }
            other => panic!("expected InvalidInput, got {other:?}"),
        }
    }

    #[test]
    fn new_rejects_empty_linear_issue_id() {
        let mut snapshot = sample_snapshot();
        snapshot.linear_issue_id = "".into();
        let err = IssueWorkspaceContext::new(snapshot, vec![], vec![])
            .expect_err("empty linear_issue_id must be rejected");
        match err {
            CoreError::InvalidInput(msg) => {
                assert!(msg.contains("linear_issue_id"), "msg = {msg}")
            }
            other => panic!("expected InvalidInput, got {other:?}"),
        }
    }

    #[test]
    fn new_rejects_empty_linear_team_key() {
        let mut snapshot = sample_snapshot();
        snapshot.linear_team_key = "".into();
        let err = IssueWorkspaceContext::new(snapshot, vec![], vec![])
            .expect_err("empty linear_team_key must be rejected");
        match err {
            CoreError::InvalidInput(msg) => {
                assert!(msg.contains("linear_team_key"), "msg = {msg}")
            }
            other => panic!("expected InvalidInput, got {other:?}"),
        }
    }

    #[test]
    fn new_rejects_duplicate_initial_links() {
        let snapshot = sample_snapshot();
        let dup = NewLink {
            link_kind: IssueWorkspaceContextLinkKind::Run,
            target_id: "run-1".into(),
        };
        let err = IssueWorkspaceContext::new(
            snapshot,
            vec![],
            vec![
                dup.clone(),
                NewLink {
                    link_kind: IssueWorkspaceContextLinkKind::Run,
                    target_id: "run-1".into(),
                },
            ],
        )
        .expect_err("duplicate initial links must be rejected");
        match err {
            CoreError::InvalidInput(msg) => assert!(msg.contains("duplicate link"), "msg = {msg}"),
            other => panic!("expected InvalidInput, got {other:?}"),
        }
    }

    #[test]
    fn set_memory_ledger_pointer_round_trips_and_bumps_updated_at() {
        let (mut ctx, _, _) =
            IssueWorkspaceContext::new(sample_snapshot(), vec![], vec![]).expect("valid snapshot");
        let initial_updated_at = ctx.updated_at;
        std::thread::sleep(std::time::Duration::from_millis(2));
        ctx.set_memory_ledger_pointer(Some("ledger-uuid".into()));
        assert_eq!(ctx.memory_ledger_pointer.as_deref(), Some("ledger-uuid"));
        assert!(ctx.updated_at > initial_updated_at);

        ctx.set_memory_ledger_pointer(None);
        assert!(ctx.memory_ledger_pointer.is_none());
    }

    #[test]
    fn link_kind_round_trips_through_serde() {
        for kind in [
            IssueWorkspaceContextLinkKind::LaunchTask,
            IssueWorkspaceContextLinkKind::Run,
            IssueWorkspaceContextLinkKind::Conversation,
        ] {
            let encoded = serde_json::to_string(&kind).expect("serialize");
            let decoded: IssueWorkspaceContextLinkKind =
                serde_json::from_str(&encoded).expect("deserialize");
            assert_eq!(decoded, kind);
        }
        let snake = serde_json::to_string(&IssueWorkspaceContextLinkKind::LaunchTask).unwrap();
        assert_eq!(snake, "\"launch_task\"");
    }
}
