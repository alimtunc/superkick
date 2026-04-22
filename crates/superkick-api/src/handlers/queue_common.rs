//! Shared per-run triage fan-out for the operator dashboard (SUP-58) and the
//! launch queue (SUP-80). Both surfaces need the same signals — pending
//! attention, pending interrupts, PR state, ownership snapshots, operator
//! bucket — so that bucketing and reason strings stay consistent. Keeping the
//! fan-out in one place prevents the horizon and the classifier inputs from
//! drifting between the two handlers.

use futures_util::future::try_join_all;
use superkick_core::{
    AttentionStatus, InterruptStatus, LinkedPrSummary, OperatorQueue, QueueInputs, Run,
    SessionOwnership, classify_queue, queue_card_reason, trim_for_queue,
};
use superkick_storage::repo::{AttentionRequestRepo, InterruptRepo, RunRepo};

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

    Ok(RunTriage {
        run,
        pending_attention_count,
        pending_interrupt_count,
        pr,
        ownership,
        operator_bucket,
        reason,
    })
}
