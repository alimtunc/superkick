//! Recovery scheduler (SUP-73).
//!
//! Periodic background tick that classifies non-terminal runs as `Healthy`
//! or `Stalled` and surfaces transitions to the operator.
//!
//! # Hard invariant — no autonomous mutation
//!
//! The scheduler **never** changes a run's `state`, never creates an
//! interrupt, never auto-fails or auto-cancels. Every recovery lever stays
//! with the operator (cancel, retry, reply to attention/interrupt). If a run
//! is `WaitingHuman`, we wait for the human — visibility is the entire point.
//!
//! Adding any auto-action policy (auto-fail past N hours, auto-retry on
//! silence, etc.) is a new ticket with explicit policy + UI, not a quiet
//! extension here. The integration test in `tests/recovery_scheduler.rs`
//! pins this contract: a run left for an arbitrarily long time stays in its
//! current state byte-equal before/after a tick.
//!
//! # Deduplication
//!
//! The audit table allows one row per `(run_id, kind, detected_at)`, but the
//! scheduler additionally dedupes against the *most recent* row for the run
//! before inserting. So a run that has been continuously stalled for an hour
//! produces exactly one `stalled` row, not 120 (one per 30-second tick).

use std::sync::Arc;

use chrono::Utc;
use tokio::task::JoinHandle;
use tokio::time::MissedTickBehavior;
use tracing::{debug, warn};

use superkick_core::{
    RecoveryAction, RecoveryConfig, RunRecoveredPayload, RunStalledPayload, classify_recovery,
    decide_recovery_action,
};
use superkick_runtime::WorkspaceEventBus;
use superkick_storage::SqliteRecoveryEventRepo;

/// Spawn the periodic recovery tick. The task lives until the process exits.
pub fn spawn_recovery_scheduler(
    recovery_repo: Arc<SqliteRecoveryEventRepo>,
    workspace_bus: Arc<WorkspaceEventBus>,
    cfg: RecoveryConfig,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(cfg.tick_interval);
        // Skip ticks if a previous tick is somehow still running. Keeps us
        // from queueing under DB pressure.
        interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
        // Drop the immediate first tick — let the server warm up.
        interval.tick().await;
        loop {
            interval.tick().await;
            if let Err(err) = tick(&recovery_repo, &workspace_bus, &cfg).await {
                warn!(error = %err, "recovery scheduler tick failed; will retry next interval");
            }
        }
    })
}

/// One classification pass. Public so the integration test can drive ticks
/// deterministically rather than waiting on the interval.
pub async fn tick(
    recovery_repo: &SqliteRecoveryEventRepo,
    workspace_bus: &WorkspaceEventBus,
    cfg: &RecoveryConfig,
) -> anyhow::Result<()> {
    let now = Utc::now();
    let candidates = recovery_repo.list_candidates().await?;
    debug!(count = candidates.len(), "recovery scheduler tick");

    for candidate in candidates {
        let status = classify_recovery(&candidate, now, cfg);
        // Read the most recent row to drive deduplication. If reading the
        // audit row fails we skip this candidate this tick and retry on the
        // next — better than risking a double-emit.
        let latest = match recovery_repo.latest_for_run(candidate.run_id).await {
            Ok(row) => row,
            Err(err) => {
                warn!(
                    run_id = %candidate.run_id,
                    error = %err,
                    "failed to load latest recovery event; skipping run for this tick"
                );
                continue;
            }
        };
        let latest_tag = latest.as_ref().map(|r| r.kind.to_latest_tag());

        match decide_recovery_action(status, latest_tag) {
            RecoveryAction::EmitStalled { since, reason } => {
                if let Err(err) = recovery_repo
                    .insert_stalled(candidate.run_id, &reason, since, now)
                    .await
                {
                    warn!(
                        run_id = %candidate.run_id,
                        error = %err,
                        "failed to persist stalled recovery event"
                    );
                    continue;
                }
                workspace_bus.publish(
                    RunStalledPayload {
                        run_id: candidate.run_id,
                        since,
                        reason,
                        detected_at: now,
                    }
                    .into(),
                );
            }
            RecoveryAction::EmitRecovered => {
                if let Err(err) = recovery_repo.insert_recovered(candidate.run_id, now).await {
                    warn!(
                        run_id = %candidate.run_id,
                        error = %err,
                        "failed to persist recovered recovery event"
                    );
                    continue;
                }
                workspace_bus.publish(
                    RunRecoveredPayload {
                        run_id: candidate.run_id,
                        detected_at: now,
                    }
                    .into(),
                );
            }
            RecoveryAction::Skip => {}
        }
    }

    Ok(())
}
