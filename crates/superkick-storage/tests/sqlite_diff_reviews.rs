//! SUP-199 — SQLite persistence for local diff review threads.
//!
//! Hits a real in-memory SQLite database. Pins:
//! - line anchor persistence and run scoping;
//! - replies plus resolve/unresolve/delete lifecycle;
//! - per-file reviewed state toggles.

use anyhow::Result;
use superkick_core::{
    CoreError, DiffReviewAnchor, DiffReviewFileReviewedChange, DiffReviewLineSide,
    DiffReviewThreadState, ExecutionMode, NewDiffReviewComment, NewDiffReviewThread, Run, RunId,
    TriggerSource,
};
use superkick_storage::repo::{DiffReviewRepo, RunRepo};
use superkick_storage::{SqliteDiffReviewRepo, SqliteRunRepo, connect_with_capacity};

async fn setup() -> Result<(SqliteDiffReviewRepo, SqliteRunRepo)> {
    let pool = connect_with_capacity("sqlite::memory:", 1).await?;
    Ok((
        SqliteDiffReviewRepo::new(pool.clone()),
        SqliteRunRepo::new(pool),
    ))
}

async fn insert_run(repo: &SqliteRunRepo) -> Result<RunId> {
    let run = Run::new(
        "issue-1".into(),
        "SUP-199".into(),
        "owner/repo".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    let run_id = run.id;
    repo.insert(&run).await?;
    Ok(run_id)
}

fn anchor(run_id: RunId, file_path: &str, new_line: u32) -> DiffReviewAnchor {
    DiffReviewAnchor {
        run_id,
        issue_id: Some("issue-1".into()),
        file_path: file_path.into(),
        old_path: None,
        side: DiffReviewLineSide::New,
        old_line: None,
        new_line: Some(new_line),
        hunk_header: Some("@@ -1,2 +1,3 @@".into()),
        hunk_index: Some(0),
        base_ref: Some("abc1234".into()),
        head_ref: Some("def5678".into()),
    }
}

#[tokio::test]
async fn create_thread_persists_anchor_and_scopes_by_run() -> Result<()> {
    let (repo, run_repo) = setup().await?;
    let run_id = insert_run(&run_repo).await?;
    let other_run_id = RunId::new();

    let thread = repo
        .create_thread(NewDiffReviewThread {
            anchor: anchor(run_id, "src/lib.rs", 42),
            author: Some("operator".into()),
            body: "Prefer returning Result here.".into(),
        })
        .await?;

    assert_eq!(thread.anchor.run_id, run_id);
    assert_eq!(thread.anchor.file_path, "src/lib.rs");
    assert_eq!(thread.anchor.side, DiffReviewLineSide::New);
    assert_eq!(thread.anchor.new_line, Some(42));
    assert_eq!(thread.state, DiffReviewThreadState::Open);
    assert_eq!(thread.comments.len(), 1);
    assert_eq!(thread.comments[0].body, "Prefer returning Result here.");

    let state = repo.list_by_run(run_id).await?;
    assert_eq!(state.threads.len(), 1);
    assert_eq!(state.unresolved_thread_count, 1);
    assert_eq!(state.unresolved_comment_count, 1);

    let other_state = repo.list_by_run(other_run_id).await?;
    assert!(other_state.threads.is_empty());
    assert_eq!(other_state.unresolved_comment_count, 0);

    Ok(())
}

#[tokio::test]
async fn replies_resolve_unresolve_and_thread_delete_round_trip() -> Result<()> {
    let (repo, run_repo) = setup().await?;
    let run_id = insert_run(&run_repo).await?;
    let thread = repo
        .create_thread(NewDiffReviewThread {
            anchor: anchor(run_id, "ui/src/App.tsx", 7),
            author: Some("operator".into()),
            body: "This branch needs a null state.".into(),
        })
        .await?;

    let reply = repo
        .add_comment(
            thread.id,
            NewDiffReviewComment {
                author: Some("operator".into()),
                body: "Also cover it in the component test.".into(),
            },
        )
        .await?;
    assert_eq!(reply.thread_id, thread.id);

    let resolved = repo
        .set_thread_resolved(thread.id, true)
        .await?
        .expect("resolved thread");
    assert_eq!(resolved.state, DiffReviewThreadState::Resolved);
    assert_eq!(resolved.comments.len(), 2);

    let state = repo.list_by_run(run_id).await?;
    assert_eq!(state.unresolved_thread_count, 0);
    assert_eq!(state.unresolved_comment_count, 0);

    let reopened = repo
        .set_thread_resolved(thread.id, false)
        .await?
        .expect("reopened thread");
    assert_eq!(reopened.state, DiffReviewThreadState::Open);

    let deleted = repo.delete_thread(thread.id).await?;
    assert!(deleted);
    assert!(repo.list_by_run(run_id).await?.threads.is_empty());

    Ok(())
}

#[tokio::test]
async fn empty_comment_update_returns_core_validation_error() -> Result<()> {
    let (repo, run_repo) = setup().await?;
    let run_id = insert_run(&run_repo).await?;
    let thread = repo
        .create_thread(NewDiffReviewThread {
            anchor: anchor(run_id, "ui/src/App.tsx", 7),
            author: Some("operator".into()),
            body: "This branch needs a null state.".into(),
        })
        .await?;

    let err = repo
        .update_comment(thread.comments[0].id, "   ".into())
        .await
        .expect_err("empty comment update should fail");

    assert!(matches!(
        err.downcast_ref::<CoreError>(),
        Some(CoreError::InvalidInput(message))
            if message.contains("review comment body must not be empty")
    ));

    Ok(())
}

#[tokio::test]
async fn deleting_last_comment_removes_thread() -> Result<()> {
    let (repo, run_repo) = setup().await?;
    let run_id = insert_run(&run_repo).await?;
    let thread = repo
        .create_thread(NewDiffReviewThread {
            anchor: anchor(run_id, "ui/src/App.tsx", 7),
            author: Some("operator".into()),
            body: "This branch needs a null state.".into(),
        })
        .await?;

    assert!(repo.delete_comment(thread.comments[0].id).await?);

    let state = repo.list_by_run(run_id).await?;
    assert!(state.threads.is_empty());
    assert_eq!(state.unresolved_thread_count, 0);
    assert_eq!(state.unresolved_comment_count, 0);

    Ok(())
}

#[tokio::test]
async fn reviewed_file_state_upserts_per_run_and_file() -> Result<()> {
    let (repo, run_repo) = setup().await?;
    let run_id = insert_run(&run_repo).await?;

    let reviewed = repo
        .set_file_reviewed(DiffReviewFileReviewedChange {
            run_id,
            issue_id: Some("issue-1".into()),
            file_path: "crates/superkick-core/src/lib.rs".into(),
            old_path: None,
            reviewed: true,
            reviewer: Some("operator".into()),
        })
        .await?;
    assert!(reviewed.reviewed);

    let state = repo.list_by_run(run_id).await?;
    assert_eq!(state.reviewed_files.len(), 1);
    assert_eq!(
        state.reviewed_files[0].file_path,
        "crates/superkick-core/src/lib.rs"
    );
    assert!(state.reviewed_files[0].reviewed);

    let unreviewed = repo
        .set_file_reviewed(DiffReviewFileReviewedChange {
            run_id,
            issue_id: Some("issue-1".into()),
            file_path: "crates/superkick-core/src/lib.rs".into(),
            old_path: None,
            reviewed: false,
            reviewer: Some("operator".into()),
        })
        .await?;
    assert!(!unreviewed.reviewed);

    let state = repo.list_by_run(run_id).await?;
    assert_eq!(state.reviewed_files.len(), 1);
    assert!(!state.reviewed_files[0].reviewed);

    Ok(())
}
