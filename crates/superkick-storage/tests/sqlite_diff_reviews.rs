//! SUP-199 — SQLite persistence for local diff review threads.
//!
//! Hits a real in-memory SQLite database. Pins:
//! - line anchor persistence and run scoping;
//! - replies plus resolve/unresolve/delete lifecycle;
//! - per-file reviewed state toggles.

use anyhow::Result;
use superkick_core::{
    CoreError, DiffReviewAnchor, DiffReviewFileReviewedChange, DiffReviewLineSide,
    DiffReviewSubject, DiffReviewThreadState, ExecutionMode, NewDiffReviewComment,
    NewDiffReviewThread, Run, RunId, TriggerSource,
};
use superkick_storage::repo::{DiffReviewRepo, RunRepo};
use superkick_storage::{SqliteDiffReviewRepo, SqliteRunRepo, connect_with_capacity};
use uuid::Uuid;

const LEGACY_DIFF_REVIEW_SCHEMA_WITHOUT_LINE_RANGES: &str = r#"
DROP TABLE IF EXISTS diff_review_comments;
DROP TABLE IF EXISTS diff_review_file_states;
DROP TABLE IF EXISTS diff_review_threads;

CREATE TABLE diff_review_threads (
    id            TEXT PRIMARY KEY NOT NULL,
    run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    issue_id      TEXT,
    file_path     TEXT NOT NULL CHECK(length(trim(file_path)) > 0),
    old_path      TEXT,
    side          TEXT NOT NULL CHECK(side IN ('old', 'new', 'context')),
    old_line      INTEGER CHECK(old_line IS NULL OR old_line > 0),
    new_line      INTEGER CHECK(new_line IS NULL OR new_line > 0),
    hunk_header   TEXT,
    hunk_index    INTEGER,
    base_ref      TEXT,
    head_ref      TEXT,
    state         TEXT NOT NULL CHECK(state IN ('open', 'resolved')),
    author        TEXT NOT NULL CHECK(length(trim(author)) > 0),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    CHECK (
        (side = 'old' AND old_line IS NOT NULL) OR
        (side = 'new' AND new_line IS NOT NULL) OR
        (side = 'context' AND old_line IS NOT NULL AND new_line IS NOT NULL)
    )
);

CREATE INDEX idx_diff_review_threads_run
    ON diff_review_threads(run_id, created_at);

CREATE INDEX idx_diff_review_threads_file
    ON diff_review_threads(run_id, file_path, state);

CREATE TABLE diff_review_comments (
    id          TEXT PRIMARY KEY NOT NULL,
    thread_id   TEXT NOT NULL REFERENCES diff_review_threads(id) ON DELETE CASCADE,
    author      TEXT NOT NULL CHECK(length(trim(author)) > 0),
    body        TEXT NOT NULL CHECK(length(trim(body)) > 0),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX idx_diff_review_comments_thread
    ON diff_review_comments(thread_id, created_at);

CREATE TABLE diff_review_file_states (
    run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    issue_id    TEXT,
    file_path   TEXT NOT NULL CHECK(length(trim(file_path)) > 0),
    old_path    TEXT,
    reviewed    INTEGER NOT NULL CHECK(reviewed IN (0, 1)),
    reviewer    TEXT,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (run_id, file_path)
);

CREATE INDEX idx_diff_review_file_states_run
    ON diff_review_file_states(run_id);
"#;

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
    subject_anchor(DiffReviewSubject::run(run_id), file_path, new_line)
}

fn subject_anchor(subject: DiffReviewSubject, file_path: &str, new_line: u32) -> DiffReviewAnchor {
    DiffReviewAnchor {
        subject,
        issue_id: Some("issue-1".into()),
        file_path: file_path.into(),
        old_path: None,
        side: DiffReviewLineSide::New,
        old_line: None,
        old_line_end: None,
        new_line: Some(new_line),
        new_line_end: None,
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

    assert_eq!(thread.anchor.subject.run_id(), Some(run_id));
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
async fn line_range_anchor_round_trips() -> Result<()> {
    let (repo, run_repo) = setup().await?;
    let run_id = insert_run(&run_repo).await?;
    let mut review_anchor = anchor(run_id, "src/lib.rs", 42);
    review_anchor.new_line_end = Some(45);

    let thread = repo
        .create_thread(NewDiffReviewThread {
            anchor: review_anchor,
            author: Some("operator".into()),
            body: "Extract this full range.".into(),
        })
        .await?;

    let state = repo.list_by_run(run_id).await?;
    assert_eq!(thread.anchor.new_line, Some(42));
    assert_eq!(thread.anchor.new_line_end, Some(45));
    assert_eq!(state.threads[0].anchor.new_line_end, Some(45));

    Ok(())
}

#[tokio::test]
async fn existing_diff_review_schema_migrates_line_range_columns() -> Result<()> {
    let db_path = std::env::temp_dir().join(format!(
        "superkick-diff-review-line-range-{}.sqlite",
        Uuid::new_v4()
    ));
    let database_url = format!("sqlite://{}", db_path.display());

    {
        let pool = connect_with_capacity(&database_url, 1).await?;
        sqlx::raw_sql(sqlx::AssertSqlSafe(
            LEGACY_DIFF_REVIEW_SCHEMA_WITHOUT_LINE_RANGES.to_string(),
        ))
        .execute(&pool)
        .await?;
        sqlx::query(
            "DELETE FROM _migrations WHERE name IN \
             ('041_diff_review_line_ranges', '053_diff_review_subjects')",
        )
        .execute(&pool)
        .await?;
        pool.close().await;
    }

    let pool = connect_with_capacity(&database_url, 1).await?;
    let repo = SqliteDiffReviewRepo::new(pool.clone());
    let run_repo = SqliteRunRepo::new(pool.clone());
    let run_id = insert_run(&run_repo).await?;
    let mut review_anchor = anchor(run_id, "src/lib.rs", 42);
    review_anchor.new_line_end = Some(45);

    let thread = repo
        .create_thread(NewDiffReviewThread {
            anchor: review_anchor,
            author: Some("operator".into()),
            body: "Extract this full range.".into(),
        })
        .await?;

    assert_eq!(thread.anchor.new_line_end, Some(45));

    pool.close().await;
    let _ = std::fs::remove_file(db_path);

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
            subject: DiffReviewSubject::run(run_id),
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
            subject: DiffReviewSubject::run(run_id),
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

#[tokio::test]
async fn pull_request_subject_round_trips_without_a_run() -> Result<()> {
    let (repo, _run_repo) = setup().await?;
    let pr = DiffReviewSubject::pull_request("owner/repo", 7, "deadbeef");

    let thread = repo
        .create_thread(NewDiffReviewThread {
            anchor: subject_anchor(pr.clone(), "src/main.rs", 12),
            author: Some("operator".into()),
            body: "Guard this unwrap before submitting the review.".into(),
        })
        .await?;
    assert_eq!(thread.anchor.subject, pr);
    assert_eq!(thread.anchor.subject.repo_slug(), Some("owner/repo"));
    assert_eq!(thread.anchor.subject.pr_number(), Some(7));

    repo.set_file_reviewed(DiffReviewFileReviewedChange {
        subject: pr.clone(),
        issue_id: None,
        file_path: "src/main.rs".into(),
        old_path: None,
        reviewed: true,
        reviewer: Some("operator".into()),
    })
    .await?;

    let state = repo.list_by_subject(pr).await?;
    assert_eq!(state.threads.len(), 1);
    assert_eq!(state.unresolved_comment_count, 1);
    assert_eq!(state.reviewed_files.len(), 1);
    assert!(state.reviewed_files[0].reviewed);

    // A run subject must not see the PR's threads.
    let run_state = repo.list_by_run(RunId::new()).await?;
    assert!(run_state.threads.is_empty());
    assert!(run_state.reviewed_files.is_empty());

    Ok(())
}
