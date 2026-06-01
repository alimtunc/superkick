//! Theme-1 — `RunService` integration tests.
//!
//! Hits a real in-memory SQLite per CLAUDE.md rule 9 — the run / launch-task /
//! event repos are never mocked. Only the two object-safe seams (`RunSpawn`,
//! `LaunchTaskCanceller`) are stubbed, since they wrap process-level side
//! effects (engine execution, launch-task cancellation) that don't belong in a
//! unit test.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use anyhow::Result;
use superkick_core::{ExecutionMode, LaunchTaskId, Run, RunId, RunState, TriggerSource};
use superkick_runtime::{LaunchTaskCanceller, RunService, RunServiceError, RunSpawn};
use superkick_storage::repo::{RunEventRepo, RunRepo};
use superkick_storage::{SqliteLaunchTaskRepo, SqliteRunEventRepo, SqliteRunRepo, connect};
use tokio_util::sync::CancellationToken;

/// Records spawn/cancel calls so tests can assert the seam was driven without
/// standing up the real engine.
#[derive(Default)]
struct RecordingSpawner {
    spawned: AtomicUsize,
    cancelled: AtomicUsize,
}

impl RunSpawn for RecordingSpawner {
    fn spawn(&self, _run: Run) -> CancellationToken {
        self.spawned.fetch_add(1, Ordering::SeqCst);
        CancellationToken::new()
    }
    fn cancel(&self, _run_id: RunId) {
        self.cancelled.fetch_add(1, Ordering::SeqCst);
    }
}

/// Stub canceller — the cancel-via-launch-task path is exercised in the API
/// integration layer; here we only need a no-op that succeeds.
struct NoopCanceller;

impl LaunchTaskCanceller for NoopCanceller {
    fn cancel<'a>(
        &'a self,
        _id: LaunchTaskId,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send + 'a>> {
        Box::pin(async { Ok(()) })
    }
}

type Service = RunService<SqliteRunRepo, SqliteLaunchTaskRepo, SqliteRunEventRepo>;

struct Harness {
    service: Arc<Service>,
    run_repo: Arc<SqliteRunRepo>,
    event_repo: Arc<SqliteRunEventRepo>,
    spawner: Arc<RecordingSpawner>,
}

async fn build_service() -> Result<Harness> {
    let pool = connect("sqlite::memory:").await?;
    let run_repo = Arc::new(SqliteRunRepo::new(pool.clone()));
    let launch_task_repo = Arc::new(SqliteLaunchTaskRepo::new(pool.clone()));
    let event_repo = Arc::new(SqliteRunEventRepo::new(pool));
    let spawner = Arc::new(RecordingSpawner::default());
    let service = RunService::new(
        Arc::clone(&run_repo),
        launch_task_repo,
        Arc::clone(&event_repo),
        Arc::new(NoopCanceller) as Arc<dyn LaunchTaskCanceller>,
        Arc::clone(&spawner) as Arc<dyn RunSpawn>,
    );
    Ok(Harness {
        service,
        run_repo,
        event_repo,
        spawner,
    })
}

fn sample_run(identifier: &str) -> Run {
    Run::new(
        "issue-uuid".into(),
        identifier.into(),
        "owner/repo".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        false,
        None,
    )
}

#[tokio::test]
async fn spawn_run_persists_and_drives_spawner() -> Result<()> {
    let h = build_service().await?;
    let run = sample_run("SUP-RS-1");
    let id = run.id;

    let returned = h.service.spawn_run(run).await.expect("spawn ok");
    assert_eq!(returned.id, id);

    let persisted = h.run_repo.get(id).await?.expect("run persisted");
    assert_eq!(persisted.id, id);
    assert_eq!(h.spawner.spawned.load(Ordering::SeqCst), 1);
    Ok(())
}

#[tokio::test]
async fn spawn_run_duplicate_active_is_conflict() -> Result<()> {
    let h = build_service().await?;

    h.service
        .spawn_run(sample_run("SUP-RS-2"))
        .await
        .expect("first spawn ok");
    let err = h
        .service
        .spawn_run(sample_run("SUP-RS-2"))
        .await
        .expect_err("second spawn for same active issue must conflict");

    assert!(
        matches!(err, RunServiceError::Conflict(_)),
        "expected Conflict, got {err:?}"
    );
    Ok(())
}

#[tokio::test]
async fn cancel_run_missing_is_none() -> Result<()> {
    let h = build_service().await?;
    let outcome = h.service.cancel_run(RunId(uuid::Uuid::new_v4())).await?;
    assert!(outcome.is_none());
    // The spawner cancel is still signalled (idempotent no-op).
    assert_eq!(h.spawner.cancelled.load(Ordering::SeqCst), 1);
    Ok(())
}

#[tokio::test]
async fn cancel_run_transitions_and_emits_event() -> Result<()> {
    let h = build_service().await?;
    let run = sample_run("SUP-RS-3");
    let id = run.id;
    h.service.spawn_run(run).await.expect("spawn ok");

    let cancelled = h.service.cancel_run(id).await?.expect("run found");
    assert_eq!(cancelled.state, RunState::Cancelled);

    let refreshed = h.run_repo.get(id).await?.expect("run persisted");
    assert_eq!(refreshed.state, RunState::Cancelled);

    let events = h.event_repo.list_by_run(id).await?;
    assert!(
        !events.is_empty(),
        "a cancel state-change event should be emitted"
    );
    Ok(())
}

#[tokio::test]
async fn cancel_run_terminal_is_noop() -> Result<()> {
    let h = build_service().await?;
    let run = sample_run("SUP-RS-4");
    let id = run.id;
    h.service.spawn_run(run).await.expect("spawn ok");
    // First cancel drives it terminal.
    h.service.cancel_run(id).await?.expect("found");
    let events_after_first = h.event_repo.list_by_run(id).await?.len();
    // Second cancel on a terminal run is a no-op returning the run unchanged
    // and emitting no further state-change event.
    let again = h.service.cancel_run(id).await?.expect("found");
    assert_eq!(again.state, RunState::Cancelled);
    assert_eq!(
        h.event_repo.list_by_run(id).await?.len(),
        events_after_first,
        "terminal-run cancel must not emit a second event"
    );
    Ok(())
}
