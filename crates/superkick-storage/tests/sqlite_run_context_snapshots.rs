//! SUP-187 — SQLite integration tests for the `RunContextSnapshot` projection.
//!
//! Hits a real in-memory SQLite per CLAUDE.md rule 9. Pins the regenerable
//! upsert contract: one current row per launch task, replaced wholesale on
//! re-derivation; unknown tasks read back as `None`.

use anyhow::Result;
use chrono::Utc;
use superkick_core::{
    LaunchRecipe, LaunchTaskId, LaunchTaskStatus, RUN_CONTEXT_SNAPSHOT_VERSION, RunContextSnapshot,
    SnapshotChangedFiles, SnapshotIssue, SnapshotProvider, SnapshotTask,
};
use superkick_storage::repo::RunContextSnapshotRepo;
use superkick_storage::{SqliteRunContextSnapshotRepo, connect};

async fn setup() -> Result<SqliteRunContextSnapshotRepo> {
    let pool = connect("sqlite::memory:").await?;
    Ok(SqliteRunContextSnapshotRepo::new(pool))
}

fn snapshot_for(id: LaunchTaskId, summary: Option<&str>) -> RunContextSnapshot {
    let now = Utc::now();
    RunContextSnapshot {
        version: RUN_CONTEXT_SNAPSHOT_VERSION,
        generated_at: now,
        launch_task_id: id,
        run_id: None,
        issue: SnapshotIssue {
            linear_issue_id: "issue-uuid".into(),
            identifier: Some("SUP-187".into()),
            title: Some("RunContextSnapshot".into()),
            status_name: Some("In Progress".into()),
            body_excerpt: None,
            workspace_context_id: None,
        },
        task: SnapshotTask {
            status: LaunchTaskStatus::Running,
            recipe: LaunchRecipe::PlanImplementReview,
            objective: None,
            summary: summary.map(String::from),
            created_at: now,
            updated_at: now,
        },
        run: None,
        steps: vec![],
        current_step: None,
        provider: SnapshotProvider {
            provider: None,
            agent: None,
            model: None,
            provider_session_id: None,
        },
        worktree: None,
        changed_files: SnapshotChangedFiles {
            paths: vec![],
            truncated: false,
        },
        diff_ref: None,
        recent_events: vec![],
        pending_decisions: vec![],
        blocking: None,
        memory: None,
    }
}

#[tokio::test]
async fn upsert_then_get_round_trips() -> Result<()> {
    let repo = setup().await?;
    let id = LaunchTaskId::new();
    let snap = snapshot_for(id, Some("first build"));

    repo.upsert(&snap).await?;
    let loaded = repo.get_by_launch_task(id).await?.expect("snapshot row");

    assert_eq!(loaded, snap);
    assert_eq!(loaded.version, RUN_CONTEXT_SNAPSHOT_VERSION);
    assert_eq!(loaded.task.summary.as_deref(), Some("first build"));
    Ok(())
}

#[tokio::test]
async fn upsert_replaces_prior_snapshot_keeping_one_row() -> Result<()> {
    let repo = setup().await?;
    let id = LaunchTaskId::new();

    repo.upsert(&snapshot_for(id, Some("first build"))).await?;
    let regenerated = snapshot_for(id, Some("regenerated build"));
    repo.upsert(&regenerated).await?;

    let loaded = repo.get_by_launch_task(id).await?.expect("snapshot row");
    assert_eq!(
        loaded.task.summary.as_deref(),
        Some("regenerated build"),
        "regeneration must replace the prior snapshot, not append",
    );
    assert_eq!(loaded, regenerated);
    Ok(())
}

#[tokio::test]
async fn get_unknown_launch_task_returns_none() -> Result<()> {
    let repo = setup().await?;
    let missing = repo.get_by_launch_task(LaunchTaskId::new()).await?;
    assert!(missing.is_none());
    Ok(())
}

#[tokio::test]
async fn distinct_tasks_keep_independent_snapshots() -> Result<()> {
    let repo = setup().await?;
    let a = LaunchTaskId::new();
    let b = LaunchTaskId::new();

    repo.upsert(&snapshot_for(a, Some("task a"))).await?;
    repo.upsert(&snapshot_for(b, Some("task b"))).await?;

    assert_eq!(
        repo.get_by_launch_task(a)
            .await?
            .unwrap()
            .task
            .summary
            .as_deref(),
        Some("task a"),
    );
    assert_eq!(
        repo.get_by_launch_task(b)
            .await?
            .unwrap()
            .task
            .summary
            .as_deref(),
        Some("task b"),
    );
    Ok(())
}
