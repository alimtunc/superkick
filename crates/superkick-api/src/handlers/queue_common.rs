//! Shared per-run triage fan-out for the operator dashboard (SUP-58) and the
//! launch queue (SUP-80). Both surfaces need the same signals — pending
//! attention, pending interrupts, PR state, ownership snapshots, operator
//! bucket — so that bucketing and reason strings stay consistent. Keeping the
//! fan-out in one place prevents the horizon and the classifier inputs from
//! drifting between the two handlers.

use chrono::Utc;
use futures_util::future::try_join_all;
use superkick_core::{
    AttentionStatus, InterruptStatus, LinkedPrSummary, OperatorQueue, QueueInputs, Run,
    SessionOwnership, StalledReason, classify_queue, queue_card_reason, trim_for_queue,
};
use superkick_storage::repo::{AttentionRequestRepo, InterruptRepo, RunRepo};
use tracing::warn;

use crate::AppState;
use crate::error::AppError;
use crate::handlers::runs::resolve_pr_summary;

/// Per-run triage bundle used by both queue surfaces. The `reason` is built
/// via `queue_card_reason` so the dashboard card and the launch-queue card
/// read exactly the same string for the same run.
#[derive(Debug, Clone)]
pub(crate) struct RunTriage {
    pub run: Run,
    pub pending_attention_count: usize,
    pub pending_interrupt_count: usize,
    pub pr: Option<LinkedPrSummary>,
    pub ownership: Vec<SessionOwnership>,
    pub operator_bucket: OperatorQueue,
    pub reason: String,
    /// How long the run has actually been silent, in seconds — measured from
    /// the classifier's `since` timestamp (the freshest underlying signal),
    /// **not** from the scheduler's `detected_at`. So a 31-min `WaitingHuman`
    /// run that the scheduler first sees on tick N reads "Stalled · 31m",
    /// not "Stalled · 0m". `None` when the run is healthy. The run is **not**
    /// moved to a different bucket — staleness is annotation, not
    /// re-classification.
    pub stalled_for_seconds: Option<u64>,
    /// Structured reason from the most recent stall classification. Mirrors
    /// `superkick_core::StalledReason` so the UI can humanize per kind. `None`
    /// mirrors `stalled_for_seconds`.
    pub stalled_reason: Option<StalledReason>,
}

/// Load and bucket every run visible in the operator queues. Drops cancelled
/// runs and trims the completed tail via [`trim_for_queue`] so the two
/// surfaces share the same horizon, then fans out in parallel to fetch the
/// per-run signals.
pub(crate) async fn load_triages(state: &AppState) -> Result<Vec<RunTriage>, AppError> {
    let all_runs = state.run_repo.list_all().await?;
    let runs = trim_for_queue(all_runs);
    try_join_all(runs.into_iter().map(|run| load_triage(state, run))).await
}

async fn load_triage(state: &AppState, run: Run) -> Result<RunTriage, AppError> {
    let run_id = run.id;

    let attention = state.attention_repo.list_by_run(run_id).await?;
    let pending_attention_count = attention
        .iter()
        .filter(|r| r.status == AttentionStatus::Pending)
        .count();

    let interrupts = state.interrupt_repo.list_by_run(run_id).await?;
    let pending_interrupt_count = interrupts
        .iter()
        .filter(|i| i.status == InterruptStatus::Pending)
        .count();

    let pr = resolve_pr_summary(state, run_id, &run.repo_slug).await;

    let ownership = match state.ownership_service.snapshots_for_run(run_id).await {
        Ok(snaps) => snaps,
        Err(err) => {
            tracing::warn!(
                %run_id,
                error = %err,
                "failed to read run ownership snapshots for queue surfaces"
            );
            Vec::new()
        }
    };

    let inputs = QueueInputs {
        run: &run,
        pending_attention: pending_attention_count,
        pending_interrupts: pending_interrupt_count,
        pr: pr.as_ref(),
        ownership: &ownership,
    };
    let operator_bucket = classify_queue(inputs).unwrap_or(OperatorQueue::Active);
    let reason = queue_card_reason(inputs);

    // Terminal runs (Completed / Failed / Cancelled) drop out of the recovery
    // scheduler's candidate set, so no `recovered` audit row is ever written
    // to close out a prior `stalled` row. Without this clamp, a run that
    // stalled and then completed would render a permanent "Stalled · Xm"
    // badge in the dashboard's Done column with the duration ticking forever.
    let (stalled_for_seconds, stalled_reason) = if run.state.is_terminal() {
        (None, None)
    } else {
        match state.recovery_event_repo.current_stall(run_id).await {
            Ok(Some(row)) => stall_annotation(run_id, row),
            Ok(None) => (None, None),
            Err(err) => {
                warn!(
                    %run_id,
                    error = %err,
                    "failed to read current stall annotation; treating as healthy for this render"
                );
                (None, None)
            }
        }
    };

    Ok(RunTriage {
        run,
        pending_attention_count,
        pending_interrupt_count,
        pr,
        ownership,
        operator_bucket,
        reason,
        stalled_for_seconds,
        stalled_reason,
    })
}

/// Project a `current_stall` audit row onto the dashboard's annotation pair.
/// `stalled_for_seconds` is measured from the classifier's `since` (the
/// freshest underlying signal at decision time) so the duration reflects how
/// long the run has actually been silent — not how long since the scheduler
/// first noticed. The CHECK constraint on the migration guarantees a stalled
/// row carries both `reason` JSON and `stalled_since`; the defensive guards
/// below shouldn't fire in practice but keep the dashboard rendering instead
/// of hiding the badge if the schema invariant ever drifts.
fn stall_annotation(
    run_id: superkick_core::RunId,
    row: superkick_storage::RecoveryEventRow,
) -> (Option<u64>, Option<StalledReason>) {
    let since = match row.stalled_since {
        Some(ts) => ts,
        None => {
            warn!(
                %run_id,
                detected_at = %row.detected_at,
                "stalled audit row missing stalled_since; falling back to detected_at"
            );
            row.detected_at
        }
    };
    let secs = Utc::now().signed_duration_since(since).num_seconds().max(0) as u64;
    let reason = row.reason.or_else(|| {
        warn!(
            %run_id,
            "stalled audit row missing reason JSON; rendering badge without structured reason"
        );
        None
    });
    (Some(secs), reason)
}
