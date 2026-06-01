//! SUP-149 — integration coverage for the launch-task workspace-context
//! plumbing against a real SQLite pool.
//!
//! The full `RealStepRunner` happy path requires spawning real CLI agents
//! (the same blocker that gates the SUP-124 fixture). These tests exercise
//! the two seams the runner depends on through the helpers in
//! [`launch_task_context`]:
//!
//! 1. `try_load_workspace_context` — round-trips the workspace + memory
//!    ledger and orders entries oldest-first.
//! 2. `append_step_memory_entry` — writes exactly one row per non-empty
//!    summary, skips empty / whitespace summaries, and surfaces
//!    credential-likely text as a typed error without writing.

use std::sync::Arc;

use anyhow::Result;
use superkick_core::{
    IssueWorkspaceContext, IssueWorkspaceContextSnapshot, LaunchStepKind, MemoryEntry,
};
use superkick_runtime::launch_task_context::{
    AppendError, append_step_memory_entry, try_load_workspace_context,
};
use superkick_storage::repo::{
    IssueWorkspaceContextRepo, IssueWorkspaceContextRepoDyn, MemoryEntryRepo, MemoryEntryRepoDyn,
};
use superkick_storage::{SqliteIssueWorkspaceContextRepo, SqliteMemoryEntryRepo, connect};

// ── Fixture ───────────────────────────────────────────────────────────

struct Harness {
    context_repo: Arc<SqliteIssueWorkspaceContextRepo>,
    memory_repo: Arc<SqliteMemoryEntryRepo>,
    context_dyn: Arc<dyn IssueWorkspaceContextRepoDyn>,
    memory_dyn: Arc<dyn MemoryEntryRepoDyn>,
}

async fn harness() -> Result<Harness> {
    let pool = connect("sqlite::memory:").await?;
    let context_repo = Arc::new(SqliteIssueWorkspaceContextRepo::new(pool.clone()));
    let memory_repo = Arc::new(SqliteMemoryEntryRepo::new(pool));
    let context_dyn: Arc<dyn IssueWorkspaceContextRepoDyn> = Arc::clone(&context_repo) as _;
    let memory_dyn: Arc<dyn MemoryEntryRepoDyn> = Arc::clone(&memory_repo) as _;
    Ok(Harness {
        context_repo,
        memory_repo,
        context_dyn,
        memory_dyn,
    })
}

async fn seed_context(
    repo: &SqliteIssueWorkspaceContextRepo,
    identifier: &str,
    linear_uuid: &str,
) -> Result<IssueWorkspaceContext> {
    let snapshot = IssueWorkspaceContextSnapshot {
        linear_team_key: "SUP".into(),
        linear_issue_identifier: identifier.into(),
        linear_issue_id: linear_uuid.into(),
        snapshot_title: "Test issue".into(),
        snapshot_body_md: "Body".into(),
        snapshot_status_name: "Todo".into(),
    };
    let (context, excerpts, links) = IssueWorkspaceContext::new(snapshot, vec![], vec![])?;
    IssueWorkspaceContextRepo::insert_with_children(repo, &context, &excerpts, &links).await?;
    Ok(context)
}

// ── try_load_workspace_context ───────────────────────────────────────

#[tokio::test]
async fn try_load_workspace_context_returns_none_when_not_attached() -> Result<()> {
    let h = harness().await?;
    let got = try_load_workspace_context(&h.context_dyn, &h.memory_dyn, "uuid-missing").await?;
    assert!(got.is_none(), "no workspace → None");
    Ok(())
}

#[tokio::test]
async fn try_load_workspace_context_returns_workspace_with_empty_memory_when_attached() -> Result<()>
{
    let h = harness().await?;
    let ctx = seed_context(&h.context_repo, "SUP-149", "uuid-149").await?;

    let loaded = try_load_workspace_context(&h.context_dyn, &h.memory_dyn, "uuid-149")
        .await?
        .expect("workspace must load");
    assert_eq!(loaded.context.id, ctx.id);
    assert!(
        loaded.memory_entries.is_empty(),
        "fresh workspace has no ledger entries"
    );
    assert!(loaded.excerpts.is_empty());
    Ok(())
}

#[tokio::test]
async fn try_load_workspace_context_returns_memory_entries_oldest_first() -> Result<()> {
    let h = harness().await?;
    let ctx = seed_context(&h.context_repo, "SUP-149-A", "uuid-149a").await?;

    // Insert oldest → newest so the SQLite `created_at` ordering is
    // unambiguous; the loader is contract-bound to reverse the repo's
    // newest-first page to give the prompt renderer oldest → newest.
    // Pin `created_at` per row so the cursor compare never ties — no sleep
    // to space the appends apart.
    let base = chrono::Utc::now();
    for (i, text) in ["plan first", "impl second", "review third"]
        .into_iter()
        .enumerate()
    {
        let mut entry = MemoryEntry::new(
            ctx.id,
            "plan".into(),
            Some("alice".into()),
            format!("{text} step={i}"),
        )?;
        entry.created_at = base + chrono::Duration::seconds(i as i64);
        MemoryEntryRepo::append(&*h.memory_repo, &entry).await?;
    }

    let loaded = try_load_workspace_context(&h.context_dyn, &h.memory_dyn, "uuid-149a")
        .await?
        .expect("workspace loads");
    let texts: Vec<&str> = loaded
        .memory_entries
        .iter()
        .map(|e| e.text.as_str())
        .collect();
    assert_eq!(texts.len(), 3);
    assert!(
        texts[0].starts_with("plan first"),
        "first entry must be the oldest, got {:?}",
        texts
    );
    assert!(texts[2].starts_with("review third"));
    Ok(())
}

// ── append_step_memory_entry ──────────────────────────────────────────

#[tokio::test]
async fn append_writes_one_row_per_non_empty_summary() -> Result<()> {
    let h = harness().await?;
    let ctx = seed_context(&h.context_repo, "SUP-149-B", "uuid-149b").await?;

    let id = append_step_memory_entry(
        &h.memory_dyn,
        ctx.id,
        LaunchStepKind::Plan,
        Some("planner".into()),
        "planned three steps to fix the bug",
    )
    .await
    .map_err(|e| anyhow::anyhow!("append failed: {e}"))?
    .expect("non-empty summary returns Some(id)");

    let page = MemoryEntryRepo::list_page(&*h.memory_repo, ctx.id, None, 10).await?;
    assert_eq!(page.entries.len(), 1, "exactly one ledger row");
    let row = &page.entries[0];
    assert_eq!(row.id, id);
    assert_eq!(row.role, "plan");
    assert_eq!(row.author.as_deref(), Some("planner"));
    assert!(row.text.contains("planned three steps"));
    Ok(())
}

#[tokio::test]
async fn append_uses_canonical_role_per_step_kind() -> Result<()> {
    let h = harness().await?;
    let ctx = seed_context(&h.context_repo, "SUP-149-C", "uuid-149c").await?;

    for (kind, expected_role, text) in [
        (LaunchStepKind::Plan, "plan", "plan summary"),
        (LaunchStepKind::Implement, "coder", "implement summary"),
        (LaunchStepKind::Review, "reviewer", "review summary"),
    ] {
        let id =
            append_step_memory_entry(&h.memory_dyn, ctx.id, kind, Some("the-agent".into()), text)
                .await
                .map_err(|e| anyhow::anyhow!("append for {kind:?} failed: {e}"))?
                .expect("non-empty → Some");
        let page = MemoryEntryRepo::list_page(&*h.memory_repo, ctx.id, None, 50).await?;
        let row = page
            .entries
            .iter()
            .find(|e| e.id == id)
            .expect("appended row visible");
        assert_eq!(
            row.role, expected_role,
            "step {kind:?} must map to role {expected_role}"
        );
    }
    Ok(())
}

#[tokio::test]
async fn append_skips_empty_summary_without_writing() -> Result<()> {
    let h = harness().await?;
    let ctx = seed_context(&h.context_repo, "SUP-149-D", "uuid-149d").await?;

    let outcome = append_step_memory_entry(
        &h.memory_dyn,
        ctx.id,
        LaunchStepKind::Plan,
        Some("planner".into()),
        "   \n\t  ",
    )
    .await
    .map_err(|e| anyhow::anyhow!("append failed: {e}"))?;

    assert!(outcome.is_none(), "whitespace summary must not write");
    let page = MemoryEntryRepo::list_page(&*h.memory_repo, ctx.id, None, 10).await?;
    assert!(
        page.entries.is_empty(),
        "no rows persisted for empty summary"
    );
    Ok(())
}

#[tokio::test]
async fn append_rejects_credential_likely_without_writing() -> Result<()> {
    let h = harness().await?;
    let ctx = seed_context(&h.context_repo, "SUP-149-E", "uuid-149e").await?;

    let err = append_step_memory_entry(
        &h.memory_dyn,
        ctx.id,
        LaunchStepKind::Implement,
        Some("coder".into()),
        "use ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 to authenticate",
    )
    .await
    .expect_err("credential-shape summary must error");

    match err {
        AppendError::CredentialLikely { kind } => assert_eq!(kind, "github_pat"),
        other => panic!("expected CredentialLikely, got {other:?}"),
    }
    let page = MemoryEntryRepo::list_page(&*h.memory_repo, ctx.id, None, 10).await?;
    assert!(
        page.entries.is_empty(),
        "credential-redacted summary must not persist"
    );
    Ok(())
}
