//! SUP-73 — recovery scheduler integration tests.
//!
//! Drives the scheduler `tick` against a real (in-memory) sqlite to pin two
//! invariants:
//!
//! 1. **No autonomous mutation.** A run left untouched for an arbitrary time
//!    keeps its `state` byte-equal across one (or many) ticks. The scheduler
//!    annotates; it never transitions.
//! 2. **Deduplication.** A continuously stalled run produces exactly one
//!    `stalled` audit row and exactly one bus event, not one per tick. A
//!    `Stalled → Healthy` transition emits a single `recovered` row.

use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use superkick_api::recovery_scheduler;
use superkick_core::{
    ExecutionMode, RecoveryConfig, Run, RunState, TriggerSource, WorkspaceRunEvent,
};
use superkick_runtime::WorkspaceEventBus;
use superkick_storage::SqliteRecoveryEventRepo;
use superkick_storage::repo::RunRepo;
use superkick_storage::{SqliteRunRepo, connect};

/// Build a config with very tight thresholds so we can simulate a stall by
/// rewriting `updated_at` rather than waiting wall-clock seconds.
fn tight_config() -> RecoveryConfig {
    let mut cfg = RecoveryConfig::default();
    // 1s thresholds for every state — the test rewrites `updated_at` to make
    // the candidate visibly stale.
    for entry in cfg.thresholds.values_mut() {
        *entry = Duration::from_secs(1);
    }
    cfg
}

async fn seed_waiting_human_run(repo: &SqliteRunRepo) -> Run {
    let mut run = Run::new(
        "issue-x".into(),
        "SUP-73-TEST-1".into(),
        "owner/repo".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        false,
        None,
    );
    // Drive into WaitingHuman through the legal Queued → WaitingHuman path
    // (direct Queued → WaitingHuman is valid per the state machine, see
    // `RunState::allowed_transitions`).
    run.transition_to(RunState::WaitingHuman)
        .expect("queued → waiting_human should be valid");
    repo.insert(&run).await.expect("insert run");
    run
}

/// Make a run look ancient by rewriting `updated_at` and `last_heartbeat_at`
/// in place. Avoids sleeping the test by N minutes. Deliberately bypasses
/// the repo here — there is no public API to set `updated_at` to a past
/// value, and adding one for tests is worse than the bypass.
async fn age_run(pool: &sqlx::SqlitePool, run_id: superkick_core::RunId, age_secs: i64) {
    let new_ts = (Utc::now() - chrono::Duration::seconds(age_secs)).to_rfc3339();
    sqlx::query("UPDATE runs SET updated_at = ?1, last_heartbeat_at = NULL WHERE id = ?2")
        .bind(&new_ts)
        .bind(run_id.0.to_string())
        .execute(pool)
        .await
        .expect("age run");
}

#[tokio::test]
async fn waiting_human_run_stays_waiting_human_across_ticks() {
    let pool = connect("sqlite::memory:").await.expect("pool");
    let run_repo = SqliteRunRepo::new(pool.clone());
    let recovery_repo = Arc::new(SqliteRecoveryEventRepo::new(pool.clone()));
    let bus = WorkspaceEventBus::new();

    let run = seed_waiting_human_run(&run_repo).await;
    age_run(&pool, run.id, 60 * 60).await; // 1h ago

    let cfg = tight_config();

    // Snapshot the run's state byte-row before the tick.
    let row_before: (String, Option<String>) =
        sqlx::query_as("SELECT state, last_heartbeat_at FROM runs WHERE id = ?1")
            .bind(run.id.0.to_string())
            .fetch_one(&pool)
            .await
            .expect("read state");

    // Run several ticks — the invariant must hold for any number of them.
    for _ in 0..5 {
        recovery_scheduler::tick(&recovery_repo, &bus, &cfg)
            .await
            .expect("tick");
    }

    let row_after: (String, Option<String>) =
        sqlx::query_as("SELECT state, last_heartbeat_at FROM runs WHERE id = ?1")
            .bind(run.id.0.to_string())
            .fetch_one(&pool)
            .await
            .expect("read state");

    assert_eq!(row_before, row_after, "scheduler must not mutate run state");

    // Sanity: the run *was* picked up — exactly one stalled row exists.
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM run_recovery_events WHERE run_id = ?1")
            .bind(run.id.0.to_string())
            .fetch_one(&pool)
            .await
            .expect("count");
    assert_eq!(
        count, 1,
        "exactly one stalled audit row for a continuously stalled run"
    );
}

#[tokio::test]
async fn stalled_to_healthy_transition_emits_recovered() {
    let pool = connect("sqlite::memory:").await.expect("pool");
    let run_repo = SqliteRunRepo::new(pool.clone());
    let recovery_repo = Arc::new(SqliteRecoveryEventRepo::new(pool.clone()));
    let bus = WorkspaceEventBus::new();
    let mut rx = bus.subscribe();

    let run = seed_waiting_human_run(&run_repo).await;
    age_run(&pool, run.id, 60 * 60).await;

    let cfg = tight_config();

    // First tick: emit stalled.
    recovery_scheduler::tick(&recovery_repo, &bus, &cfg)
        .await
        .expect("tick");
    let event = rx.recv().await.expect("recv stalled");
    assert!(matches!(event, WorkspaceRunEvent::RunStalled(_)));

    // Stamp a fresh heartbeat → run becomes healthy on the next tick.
    run_repo
        .update_heartbeat(run.id, Utc::now())
        .await
        .expect("heartbeat");

    recovery_scheduler::tick(&recovery_repo, &bus, &cfg)
        .await
        .expect("tick");
    let event = rx.recv().await.expect("recv recovered");
    assert!(matches!(event, WorkspaceRunEvent::RunRecovered(_)));

    // The audit row count: 1 stalled + 1 recovered = 2.
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM run_recovery_events WHERE run_id = ?1")
            .bind(run.id.0.to_string())
            .fetch_one(&pool)
            .await
            .expect("count");
    assert_eq!(count, 2);
}

#[tokio::test]
async fn terminal_run_keeps_stall_history_but_drops_off_classification() {
    // Regression for the dashboard rendering "Stalled · Xm" forever in the
    // Done column. The recovery scheduler filters terminal runs out of its
    // candidate set, so once a stalled run completes there is no `recovered`
    // row to close out the prior `stalled` row. The dashboard handler clamps
    // at read time (see `queue_common::stall_annotation`); this test pins the
    // *scheduler-side* invariant: after a run reaches `Completed`, no further
    // recovery rows are written for it on subsequent ticks. The stalled row
    // from before completion remains in the audit table — that's intended,
    // it's the historical record — but no new rows accrue.
    let pool = connect("sqlite::memory:").await.expect("pool");
    let run_repo = SqliteRunRepo::new(pool.clone());
    let recovery_repo = Arc::new(SqliteRecoveryEventRepo::new(pool.clone()));
    let bus = WorkspaceEventBus::new();

    let mut run = seed_waiting_human_run(&run_repo).await;
    age_run(&pool, run.id, 60 * 60).await;

    let cfg = tight_config();

    // Tick once → run is classified Stalled, one audit row written.
    recovery_scheduler::tick(&recovery_repo, &bus, &cfg)
        .await
        .expect("tick");
    let stalled_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM run_recovery_events WHERE run_id = ?1")
            .bind(run.id.0.to_string())
            .fetch_one(&pool)
            .await
            .expect("count");
    assert_eq!(stalled_count, 1);

    // Move the run through OpeningPr → Completed (legal transitions per the
    // state machine). The scheduler never does this; only the operator /
    // step engine does.
    run.transition_to(RunState::OpeningPr)
        .expect("waiting_human → opening_pr");
    run_repo.update(&run).await.expect("persist opening_pr");
    run.transition_to(RunState::Completed)
        .expect("opening_pr → completed");
    run_repo.update(&run).await.expect("persist completed");

    // Several more ticks — the run is terminal, so it falls out of
    // `list_candidates` and the scheduler writes nothing more.
    for _ in 0..5 {
        recovery_scheduler::tick(&recovery_repo, &bus, &cfg)
            .await
            .expect("tick");
    }

    let final_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM run_recovery_events WHERE run_id = ?1")
            .bind(run.id.0.to_string())
            .fetch_one(&pool)
            .await
            .expect("count");
    assert_eq!(
        final_count, 1,
        "no new recovery rows once the run is terminal"
    );

    // And the dashboard's `current_stall` still returns a row — it's the
    // dashboard handler's job to clamp it for terminal runs (which it does
    // via `RunState::is_terminal`); this test pins that the storage layer
    // honestly reports the historical state.
    let row = recovery_repo
        .current_stall(run.id)
        .await
        .expect("current_stall");
    assert!(row.is_some(), "audit row remains for historical record");
}

#[tokio::test]
async fn no_event_emitted_for_continuously_healthy_run() {
    let pool = connect("sqlite::memory:").await.expect("pool");
    let run_repo = SqliteRunRepo::new(pool.clone());
    let recovery_repo = Arc::new(SqliteRecoveryEventRepo::new(pool.clone()));
    let bus = WorkspaceEventBus::new();
    let mut rx = bus.subscribe();

    let run = seed_waiting_human_run(&run_repo).await;
    // Fresh updated_at — the run is healthy.

    let cfg = tight_config();

    recovery_scheduler::tick(&recovery_repo, &bus, &cfg)
        .await
        .expect("tick");

    // No event in the channel.
    assert!(rx.try_recv().is_err());
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM run_recovery_events WHERE run_id = ?1")
            .bind(run.id.0.to_string())
            .fetch_one(&pool)
            .await
            .expect("count");
    assert_eq!(count, 0);
}
