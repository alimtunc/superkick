//! Structured prompt block + memory-ledger write-back for Launch Tasks.

use std::sync::Arc;

use anyhow::{Context, Result};

use superkick_core::{
    CoreError, IssueWorkspaceContext, IssueWorkspaceContextCommentExcerpt, IssueWorkspaceContextId,
    LaunchStepKind, MemoryEntry, MemoryEntryId,
};
use superkick_storage::repo::{IssueWorkspaceContextRepoDyn, MemoryEntryRepoDyn};

use crate::text::truncate_chars;

/// Number of ledger entries surfaced inline in the prompt block. Older
/// entries stay queryable via the REST API; the prompt window is the bounded
/// projection.
const PROMPT_MEMORY_ENTRIES: u32 = 20;

/// Per-field cap on the snapshot body — long Linear descriptions otherwise
/// blow the prompt budget. Head-truncated (we keep the lede).
const SNAPSHOT_BODY_MAX_CHARS: usize = 4_000;

/// Per-field cap on comment excerpt bodies. Same head-truncation rule.
const EXCERPT_BODY_MAX_CHARS: usize = 1_000;

/// Per-field cap on memory entry texts. Tail-truncated: the decision-bearing
/// part is usually at the end of an agent's summary.
const MEMORY_ENTRY_TEXT_MAX_CHARS: usize = 1_000;

/// Canonical UI memory role for a launch step. Strings match the
/// `KnownMemoryRole` union in `ui/src/types/issueContext.ts`.
pub fn step_kind_to_memory_role(kind: LaunchStepKind) -> &'static str {
    match kind {
        LaunchStepKind::Plan => "plan",
        LaunchStepKind::Implement => "coder",
        LaunchStepKind::Review => "reviewer",
    }
}

/// Keep the tail; prepend `…` when shortened. Used where the decision-bearing
/// text usually sits at the end of an agent summary.
fn tail_truncate(s: &str, max_chars: usize) -> String {
    let total = s.chars().count();
    if total <= max_chars {
        return s.to_string();
    }
    let mut out = String::from("…");
    out.extend(s.chars().skip(total - max_chars));
    out
}

/// `memory_entries` must be oldest-first so the agent reads the ledger as a
/// chronological timeline.
pub fn render_workspace_block(
    context: &IssueWorkspaceContext,
    excerpts: &[IssueWorkspaceContextCommentExcerpt],
    memory_entries: &[MemoryEntry],
) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "## Linear issue {}\n",
        context.linear_issue_identifier
    ));
    out.push_str(&format!("- Title: {}\n", context.snapshot_title));
    out.push_str(&format!("- Status: {}\n", context.snapshot_status_name));
    out.push_str(&format!(
        "- Captured at: {}\n",
        context.captured_at.to_rfc3339()
    ));
    out.push_str("\n### Description\n\n");
    out.push_str(&truncate_chars(
        &context.snapshot_body_md,
        SNAPSHOT_BODY_MAX_CHARS,
    ));
    if !context.snapshot_body_md.is_empty() {
        out.push('\n');
    }

    if !memory_entries.is_empty() {
        out.push_str("\n## Shared memory ledger (oldest → newest)\n\n");
        for entry in memory_entries {
            let author = entry.author.as_deref().unwrap_or("agent");
            let text = tail_truncate(&entry.text, MEMORY_ENTRY_TEXT_MAX_CHARS);
            out.push_str(&format!(
                "- `{role}` · {author} · {ts}\n  {text}\n",
                role = entry.role,
                author = author,
                ts = entry.created_at.to_rfc3339(),
                text = text.replace('\n', "\n  "),
            ));
        }
    }

    if !excerpts.is_empty() {
        out.push_str("\n## Comment excerpts\n\n");
        for excerpt in excerpts {
            let author = excerpt.author.as_deref().unwrap_or("commenter");
            let body = truncate_chars(&excerpt.body_md, EXCERPT_BODY_MAX_CHARS);
            out.push_str(&format!(
                "### {author} · {ts}\n\n{body}\n\n",
                author = author,
                ts = excerpt.captured_at.to_rfc3339(),
                body = body,
            ));
        }
    }

    out
}

/// Workspace context + children loaded for one Launch Task step.
#[derive(Debug, Clone)]
pub struct LoadedWorkspaceContext {
    pub context: IssueWorkspaceContext,
    pub excerpts: Vec<IssueWorkspaceContextCommentExcerpt>,
    /// Oldest-first ordering, suited for chronological prompt rendering.
    /// Capped at [`PROMPT_MEMORY_ENTRIES`].
    pub memory_entries: Vec<MemoryEntry>,
}

/// Resolve the workspace + excerpts + recent ledger entries for a Linear
/// issue, or `None` when no workspace is attached.
///
/// The repo's `list_page` returns newest-first; we reverse so the prompt
/// reads as a timeline.
pub async fn try_load_workspace_context(
    context_repo: &Arc<dyn IssueWorkspaceContextRepoDyn>,
    memory_repo: &Arc<dyn MemoryEntryRepoDyn>,
    linear_issue_id: &str,
) -> Result<Option<LoadedWorkspaceContext>> {
    let context = match context_repo
        .find_latest_by_linear_issue_id(linear_issue_id)
        .await
        .context("workspace context lookup")?
    {
        Some(c) => c,
        None => return Ok(None),
    };

    let excerpts = context_repo
        .list_excerpts(context.id)
        .await
        .context("workspace context excerpt listing")?;

    let page = memory_repo
        .list_page(context.id, None, PROMPT_MEMORY_ENTRIES)
        .await
        .context("workspace memory listing")?;
    let mut memory_entries = page.entries;
    memory_entries.reverse();

    Ok(Some(LoadedWorkspaceContext {
        context,
        excerpts,
        memory_entries,
    }))
}

#[derive(Debug, thiserror::Error)]
pub enum AppendError {
    #[error("credential-shape text in step summary ({kind}); skipped ledger write")]
    CredentialLikely { kind: &'static str },
    #[error("memory entry validation failed: {0}")]
    Validation(String),
    #[error(transparent)]
    Storage(#[from] anyhow::Error),
}

/// Returns `Ok(None)` for empty/whitespace summaries — we never persist
/// "step completed cleanly" noise.
pub async fn append_step_memory_entry(
    memory_repo: &Arc<dyn MemoryEntryRepoDyn>,
    context_id: IssueWorkspaceContextId,
    step_kind: LaunchStepKind,
    author: Option<String>,
    summary: &str,
) -> Result<Option<MemoryEntryId>, AppendError> {
    let trimmed = summary.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let role = step_kind_to_memory_role(step_kind).to_string();
    let entry =
        MemoryEntry::new(context_id, role, author, trimmed.to_string()).map_err(
            |err| match err {
                CoreError::CredentialLikely { kind } => AppendError::CredentialLikely { kind },
                other => AppendError::Validation(other.to_string()),
            },
        )?;
    let id = entry.id;
    memory_repo.append(&entry).await?;
    Ok(Some(id))
}

#[cfg(test)]
mod tests {
    use super::*;

    use chrono::{TimeZone, Utc};
    use superkick_core::{
        IssueWorkspaceContextCommentExcerptId, IssueWorkspaceContextId, MemoryEntryId,
    };

    fn sample_context() -> IssueWorkspaceContext {
        let now = Utc.with_ymd_and_hms(2026, 5, 20, 12, 0, 0).unwrap();
        IssueWorkspaceContext {
            id: IssueWorkspaceContextId::new(),
            linear_team_key: "SUP".into(),
            linear_issue_identifier: "SUP-149".into(),
            linear_issue_id: "uuid-149".into(),
            snapshot_title: "Wire structured context".into(),
            snapshot_body_md: "We need to read context and write ledger entries.".into(),
            snapshot_status_name: "In Progress".into(),
            captured_at: now,
            memory_ledger_pointer: None,
            created_at: now,
            updated_at: now,
        }
    }

    fn entry(
        context_id: IssueWorkspaceContextId,
        role: &str,
        text: &str,
        secs: u32,
    ) -> MemoryEntry {
        MemoryEntry {
            id: MemoryEntryId::new(),
            context_id,
            author: Some("alice".into()),
            role: role.into(),
            text: text.into(),
            created_at: Utc.with_ymd_and_hms(2026, 5, 20, 12, 0, secs).unwrap(),
        }
    }

    #[test]
    fn step_kind_to_memory_role_maps_every_variant() {
        assert_eq!(step_kind_to_memory_role(LaunchStepKind::Plan), "plan");
        assert_eq!(step_kind_to_memory_role(LaunchStepKind::Implement), "coder");
        assert_eq!(step_kind_to_memory_role(LaunchStepKind::Review), "reviewer");
    }

    #[test]
    fn render_block_includes_snapshot_fields() {
        let ctx = sample_context();
        let rendered = render_workspace_block(&ctx, &[], &[]);
        assert!(rendered.contains("SUP-149"));
        assert!(rendered.contains("Wire structured context"));
        assert!(rendered.contains("In Progress"));
        assert!(rendered.contains("We need to read context"));
        assert!(!rendered.contains("Shared memory ledger"));
        assert!(!rendered.contains("Comment excerpts"));
    }

    #[test]
    fn render_block_renders_ledger_entries_in_supplied_order() {
        let ctx = sample_context();
        let entries = vec![
            entry(ctx.id, "plan", "first plan note", 1),
            entry(ctx.id, "coder", "second impl note", 2),
        ];
        let rendered = render_workspace_block(&ctx, &[], &entries);
        assert!(rendered.contains("Shared memory ledger"));
        let plan_pos = rendered
            .find("first plan note")
            .expect("plan entry present");
        let impl_pos = rendered
            .find("second impl note")
            .expect("impl entry present");
        assert!(plan_pos < impl_pos, "entries must render in supplied order");
    }

    #[test]
    fn render_block_includes_excerpts_when_present() {
        let ctx = sample_context();
        let excerpts = vec![IssueWorkspaceContextCommentExcerpt {
            id: IssueWorkspaceContextCommentExcerptId::new(),
            workspace_context_id: ctx.id,
            linear_comment_id: "lc-1".into(),
            author: Some("bob".into()),
            body_md: "Important comment to remember".into(),
            captured_at: ctx.captured_at,
        }];
        let rendered = render_workspace_block(&ctx, &excerpts, &[]);
        assert!(rendered.contains("Comment excerpts"));
        assert!(rendered.contains("bob"));
        assert!(rendered.contains("Important comment to remember"));
    }

    #[test]
    fn render_block_truncates_oversized_snapshot_body() {
        let mut ctx = sample_context();
        ctx.snapshot_body_md = "x".repeat(SNAPSHOT_BODY_MAX_CHARS + 500);
        let rendered = render_workspace_block(&ctx, &[], &[]);
        assert!(
            rendered.contains('…'),
            "ellipsis marker should appear after head truncation"
        );
    }

    #[tokio::test]
    async fn append_skips_empty_summary() {
        use std::sync::Arc;

        struct PanicRepo;
        impl superkick_storage::repo::MemoryEntryRepoDyn for PanicRepo {
            fn append<'a>(
                &'a self,
                _entry: &'a MemoryEntry,
            ) -> std::pin::Pin<Box<dyn std::future::Future<Output = anyhow::Result<()>> + Send + 'a>>
            {
                Box::pin(async { panic!("append must not be called for empty summary") })
            }

            fn list_page<'a>(
                &'a self,
                _context_id: IssueWorkspaceContextId,
                _cursor: Option<superkick_core::MemoryCursor>,
                _limit: u32,
            ) -> std::pin::Pin<
                Box<
                    dyn std::future::Future<Output = anyhow::Result<superkick_core::MemoryPage>>
                        + Send
                        + 'a,
                >,
            > {
                Box::pin(async { unreachable!() })
            }
        }

        let repo: Arc<dyn MemoryEntryRepoDyn> = Arc::new(PanicRepo);
        let ctx_id = IssueWorkspaceContextId::new();
        let got = append_step_memory_entry(&repo, ctx_id, LaunchStepKind::Plan, None, "   \n")
            .await
            .expect("empty summary returns Ok(None)");
        assert!(got.is_none(), "empty summary must not produce an id");
    }

    #[tokio::test]
    async fn append_rejects_credential_likely_summary() {
        use std::sync::Arc;

        struct PanicRepo;
        impl superkick_storage::repo::MemoryEntryRepoDyn for PanicRepo {
            fn append<'a>(
                &'a self,
                _entry: &'a MemoryEntry,
            ) -> std::pin::Pin<Box<dyn std::future::Future<Output = anyhow::Result<()>> + Send + 'a>>
            {
                Box::pin(async { panic!("append must not be called for credential text") })
            }

            fn list_page<'a>(
                &'a self,
                _context_id: IssueWorkspaceContextId,
                _cursor: Option<superkick_core::MemoryCursor>,
                _limit: u32,
            ) -> std::pin::Pin<
                Box<
                    dyn std::future::Future<Output = anyhow::Result<superkick_core::MemoryPage>>
                        + Send
                        + 'a,
                >,
            > {
                Box::pin(async { unreachable!() })
            }
        }

        let repo: Arc<dyn MemoryEntryRepoDyn> = Arc::new(PanicRepo);
        let err = append_step_memory_entry(
            &repo,
            IssueWorkspaceContextId::new(),
            LaunchStepKind::Plan,
            Some("planner".into()),
            "leaked Auth: Bearer abcdef0123456789ghijklmn token",
        )
        .await
        .expect_err("credential-likely text must error");
        assert!(matches!(err, AppendError::CredentialLikely { .. }));
    }
}
