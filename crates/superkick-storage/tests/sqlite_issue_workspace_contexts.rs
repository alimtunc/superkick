//! SUP-147 — SQLite integration tests for the issue workspace context aggregate.
//!
//! Hits a real in-memory SQLite per CLAUDE.md rule 9. Covers:
//!  - transactional insert of parent + comment excerpts + links;
//!  - `list_by_issue_identifier` orders most-recent-first by `captured_at`;
//!  - `add_link` is idempotent on `(kind, target_id)` thanks to the SQL
//!    UNIQUE constraint;
//!  - `set_memory_ledger_pointer` round-trips and `None` clears the column;
//!  - `delete` cascades to comment excerpts and links.

use anyhow::Result;
use superkick_core::{
    IssueWorkspaceContext, IssueWorkspaceContextLinkKind, IssueWorkspaceContextNewCommentExcerpt,
    IssueWorkspaceContextNewLink, IssueWorkspaceContextSnapshot,
};
use superkick_storage::repo::IssueWorkspaceContextRepo;
use superkick_storage::{SqliteIssueWorkspaceContextRepo, connect};

async fn setup() -> Result<SqliteIssueWorkspaceContextRepo> {
    let pool = connect("sqlite::memory:").await?;
    Ok(SqliteIssueWorkspaceContextRepo::new(pool))
}

fn snapshot(identifier: &str) -> IssueWorkspaceContextSnapshot {
    IssueWorkspaceContextSnapshot {
        linear_team_key: "SUP".into(),
        linear_issue_identifier: identifier.into(),
        linear_issue_id: format!("uuid-{identifier}"),
        snapshot_title: format!("{identifier} — workspace test"),
        snapshot_body_md: "Issue body with **markdown** and a `code` span.".into(),
        snapshot_status_name: "In Progress".into(),
    }
}

#[tokio::test]
async fn insert_with_children_persists_parent_excerpts_and_links() -> Result<()> {
    let repo = setup().await?;
    let (ctx, excerpts, links) = IssueWorkspaceContext::new(
        snapshot("SUP-147"),
        vec![
            IssueWorkspaceContextNewCommentExcerpt {
                linear_comment_id: "comment-1".into(),
                author: Some("alimtunc".into()),
                body_md: "First pinned comment.".into(),
            },
            IssueWorkspaceContextNewCommentExcerpt {
                linear_comment_id: "comment-2".into(),
                author: None,
                body_md: "Second pinned comment.".into(),
            },
        ],
        vec![
            IssueWorkspaceContextNewLink {
                link_kind: IssueWorkspaceContextLinkKind::LaunchTask,
                target_id: "launch-task-uuid".into(),
            },
            IssueWorkspaceContextNewLink {
                link_kind: IssueWorkspaceContextLinkKind::Run,
                target_id: "run-uuid".into(),
            },
        ],
    )?;
    repo.insert_with_children(&ctx, &excerpts, &links).await?;

    let reloaded = repo.get(ctx.id).await?.expect("workspace row");
    assert_eq!(reloaded.linear_issue_identifier, "SUP-147");
    assert_eq!(reloaded.snapshot_title, "SUP-147 — workspace test");
    assert!(reloaded.memory_ledger_pointer.is_none());

    let stored_excerpts = repo.list_excerpts(ctx.id).await?;
    assert_eq!(stored_excerpts.len(), 2);
    assert_eq!(stored_excerpts[0].linear_comment_id, "comment-1");
    assert_eq!(stored_excerpts[0].author.as_deref(), Some("alimtunc"));
    assert_eq!(stored_excerpts[1].author, None);

    let stored_links = repo.list_links(ctx.id).await?;
    assert_eq!(stored_links.len(), 2);
    let kinds: Vec<_> = stored_links.iter().map(|l| l.link_kind).collect();
    assert!(kinds.contains(&IssueWorkspaceContextLinkKind::LaunchTask));
    assert!(kinds.contains(&IssueWorkspaceContextLinkKind::Run));

    Ok(())
}

#[tokio::test]
async fn list_by_issue_identifier_orders_by_captured_at_desc() -> Result<()> {
    let repo = setup().await?;

    // Pin `captured_at` deterministically so the DESC sort is unambiguous —
    // no `Utc::now()` race and no sleep to space the inserts apart.
    let base = chrono::Utc::now();
    let (mut first, first_excerpts, first_links) =
        IssueWorkspaceContext::new(snapshot("SUP-200"), vec![], vec![])?;
    first.captured_at = base;
    repo.insert_with_children(&first, &first_excerpts, &first_links)
        .await?;

    let (mut second, second_excerpts, second_links) =
        IssueWorkspaceContext::new(snapshot("SUP-200"), vec![], vec![])?;
    second.captured_at = base + chrono::Duration::seconds(1);
    repo.insert_with_children(&second, &second_excerpts, &second_links)
        .await?;

    let listed = repo.list_by_issue_identifier("SUP-200").await?;
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[0].id, second.id, "newest first");
    assert_eq!(listed[1].id, first.id);

    let empty = repo.list_by_issue_identifier("SUP-DOES-NOT-EXIST").await?;
    assert!(empty.is_empty());

    Ok(())
}

#[tokio::test]
async fn add_link_is_idempotent_on_duplicate_kind_target() -> Result<()> {
    let repo = setup().await?;
    let (ctx, excerpts, links) = IssueWorkspaceContext::new(snapshot("SUP-201"), vec![], vec![])?;
    repo.insert_with_children(&ctx, &excerpts, &links).await?;

    let first = repo
        .add_link(ctx.id, IssueWorkspaceContextLinkKind::Run, "run-42")
        .await?;
    let again = repo
        .add_link(ctx.id, IssueWorkspaceContextLinkKind::Run, "run-42")
        .await?;
    assert_eq!(first.id, again.id, "duplicate add returns existing row");

    let stored = repo.list_links(ctx.id).await?;
    assert_eq!(stored.len(), 1, "only one row persisted");
    assert_eq!(stored[0].target_id, "run-42");

    // Same target_id under a different kind is a fresh attach.
    let other_kind = repo
        .add_link(
            ctx.id,
            IssueWorkspaceContextLinkKind::Conversation,
            "run-42",
        )
        .await?;
    assert_ne!(other_kind.id, first.id);
    assert_eq!(repo.list_links(ctx.id).await?.len(), 2);

    Ok(())
}

#[tokio::test]
async fn cascade_delete_removes_children() -> Result<()> {
    let repo = setup().await?;
    let (ctx, excerpts, links) = IssueWorkspaceContext::new(
        snapshot("SUP-202"),
        vec![IssueWorkspaceContextNewCommentExcerpt {
            linear_comment_id: "c-1".into(),
            author: None,
            body_md: "body".into(),
        }],
        vec![IssueWorkspaceContextNewLink {
            link_kind: IssueWorkspaceContextLinkKind::LaunchTask,
            target_id: "lt-1".into(),
        }],
    )?;
    repo.insert_with_children(&ctx, &excerpts, &links).await?;

    repo.delete(ctx.id).await?;

    assert!(repo.get(ctx.id).await?.is_none());
    assert!(repo.list_excerpts(ctx.id).await?.is_empty());
    assert!(repo.list_links(ctx.id).await?.is_empty());

    Ok(())
}

#[tokio::test]
async fn set_memory_ledger_pointer_overwrites_existing() -> Result<()> {
    let repo = setup().await?;
    let (ctx, excerpts, links) = IssueWorkspaceContext::new(snapshot("SUP-203"), vec![], vec![])?;
    repo.insert_with_children(&ctx, &excerpts, &links).await?;

    repo.set_memory_ledger_pointer(ctx.id, Some("ledger-1".into()))
        .await?;
    let after_set = repo.get(ctx.id).await?.expect("ctx exists");
    assert_eq!(after_set.memory_ledger_pointer.as_deref(), Some("ledger-1"));

    repo.set_memory_ledger_pointer(ctx.id, Some("ledger-2".into()))
        .await?;
    let after_overwrite = repo.get(ctx.id).await?.expect("ctx exists");
    assert_eq!(
        after_overwrite.memory_ledger_pointer.as_deref(),
        Some("ledger-2")
    );

    repo.set_memory_ledger_pointer(ctx.id, None).await?;
    let after_clear = repo.get(ctx.id).await?.expect("ctx exists");
    assert!(after_clear.memory_ledger_pointer.is_none());

    Ok(())
}
