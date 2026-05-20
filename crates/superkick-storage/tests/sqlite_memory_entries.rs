//! SUP-148 -- SQLite integration tests for the append-only memory ledger.
//!
//! Hits a real in-memory SQLite per CLAUDE.md rule 9. Covers:
//!  - `append` + `list_page` order newest-first;
//!  - cursor-based pagination drains exactly at the `limit + 1` boundary;
//!  - cascade-delete on the parent workspace removes entries;
//!  - distinct entry ids with identical text coexist (no UNIQUE on text).

use anyhow::Result;
use chrono::{Duration, Utc};
use superkick_core::{
    IssueWorkspaceContext, IssueWorkspaceContextSnapshot, MemoryEntry, MemoryEntryId,
};
use superkick_storage::repo::{IssueWorkspaceContextRepo, MemoryEntryRepo};
use superkick_storage::{
    SqliteIssueWorkspaceContextRepo, SqliteMemoryEntryRepo, connect_with_capacity,
};

async fn setup() -> Result<(SqliteIssueWorkspaceContextRepo, SqliteMemoryEntryRepo)> {
    let pool = connect_with_capacity("sqlite::memory:", 1).await?;
    Ok((
        SqliteIssueWorkspaceContextRepo::new(pool.clone()),
        SqliteMemoryEntryRepo::new(pool),
    ))
}

fn snapshot(identifier: &str) -> IssueWorkspaceContextSnapshot {
    IssueWorkspaceContextSnapshot {
        linear_team_key: "SUP".into(),
        linear_issue_identifier: identifier.into(),
        linear_issue_id: format!("uuid-{identifier}"),
        snapshot_title: format!("{identifier} -- memory ledger test"),
        snapshot_body_md: "Body.".into(),
        snapshot_status_name: "In Progress".into(),
    }
}

async fn attach_context(
    repo: &SqliteIssueWorkspaceContextRepo,
    identifier: &str,
) -> Result<IssueWorkspaceContext> {
    let (ctx, excerpts, links) = IssueWorkspaceContext::new(snapshot(identifier), vec![], vec![])?;
    repo.insert_with_children(&ctx, &excerpts, &links).await?;
    Ok(ctx)
}

/// Build an entry with a caller-supplied `created_at`. The production
/// constructor mints `Utc::now()`, but the pagination tests need
/// deterministic spacing so we hand-craft the struct here.
fn entry_at(
    context_id: superkick_core::IssueWorkspaceContextId,
    text: &str,
    created_at: chrono::DateTime<Utc>,
) -> MemoryEntry {
    MemoryEntry {
        id: MemoryEntryId::new(),
        context_id,
        author: Some("test".into()),
        role: "note".into(),
        text: text.into(),
        created_at,
    }
}

#[tokio::test]
async fn append_and_list_page_orders_newest_first() -> Result<()> {
    let (ctx_repo, mem_repo) = setup().await?;
    let ctx = attach_context(&ctx_repo, "SUP-148").await?;
    let base = Utc::now();

    for i in 0..5 {
        let entry = entry_at(ctx.id, &format!("entry-{i}"), base + Duration::seconds(i));
        mem_repo.append(&entry).await?;
    }

    let page = mem_repo.list_page(ctx.id, None, 10).await?;
    let texts: Vec<&str> = page.entries.iter().map(|e| e.text.as_str()).collect();
    assert_eq!(
        texts,
        vec!["entry-4", "entry-3", "entry-2", "entry-1", "entry-0"]
    );
    assert!(page.next_cursor.is_none());
    Ok(())
}

#[tokio::test]
async fn list_page_paginates_correctly_at_limit_plus_one_boundary() -> Result<()> {
    let (ctx_repo, mem_repo) = setup().await?;
    let ctx = attach_context(&ctx_repo, "SUP-148-pages").await?;
    let base = Utc::now();

    for i in 0..11 {
        let entry = entry_at(ctx.id, &format!("entry-{i}"), base + Duration::seconds(i));
        mem_repo.append(&entry).await?;
    }

    let first = mem_repo.list_page(ctx.id, None, 5).await?;
    assert_eq!(first.entries.len(), 5);
    assert!(first.next_cursor.is_some(), "11 > 5 must yield a cursor");
    let cursor = first.next_cursor.expect("cursor");

    let second = mem_repo.list_page(ctx.id, Some(cursor), 5).await?;
    assert_eq!(second.entries.len(), 5);
    assert!(second.next_cursor.is_some());
    let cursor = second.next_cursor.expect("cursor");

    let third = mem_repo.list_page(ctx.id, Some(cursor), 5).await?;
    assert_eq!(third.entries.len(), 1);
    assert!(third.next_cursor.is_none(), "11 / 5 / 5 / 1 then done");
    Ok(())
}

#[tokio::test]
async fn cascade_delete_context_removes_entries() -> Result<()> {
    let (ctx_repo, mem_repo) = setup().await?;
    let ctx = attach_context(&ctx_repo, "SUP-148-cascade").await?;
    for i in 0..3 {
        let entry = entry_at(ctx.id, &format!("entry-{i}"), Utc::now());
        mem_repo.append(&entry).await?;
    }
    assert_eq!(mem_repo.list_page(ctx.id, None, 10).await?.entries.len(), 3);

    ctx_repo.delete(ctx.id).await?;
    let after = mem_repo.list_page(ctx.id, None, 10).await?;
    assert!(after.entries.is_empty(), "cascade delete left orphans");
    Ok(())
}

#[tokio::test]
async fn append_is_idempotent_under_distinct_ids() -> Result<()> {
    let (ctx_repo, mem_repo) = setup().await?;
    let ctx = attach_context(&ctx_repo, "SUP-148-dupes").await?;
    let base = Utc::now();

    let one = entry_at(ctx.id, "same text", base);
    let two = entry_at(ctx.id, "same text", base + Duration::seconds(1));
    mem_repo.append(&one).await?;
    mem_repo.append(&two).await?;

    let page = mem_repo.list_page(ctx.id, None, 10).await?;
    assert_eq!(page.entries.len(), 2);
    let ids: std::collections::HashSet<_> = page.entries.iter().map(|e| e.id.0).collect();
    assert_eq!(ids.len(), 2, "ids must remain distinct");
    Ok(())
}
