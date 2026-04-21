//! Operator-facing multi-run dashboard — SUP-58.
//!
//! Returns every live run grouped by actionable queue (waiting, active, in-pr,
//! done, blocked-by-dependency, needs-human) along with the small set of
//! counters a triage surface needs to render decision-oriented cards.
//!
//! `Cancelled` runs drop off entirely — the operator already decided not to
//! ship them. `Done` is capped so the column acts as a rolling "just shipped"
//! tail, not a full lifetime log; the reliability table below the board is
//! where historical runs live.
//!
//! Classification is derived from fresh per-request reads of the run,
//! attention, interrupt, ownership, and PR tables — no scheduler state, no
//! background aggregation. Operators always see the same snapshot the
//! individual run detail page would show.

use std::collections::BTreeMap;

use axum::extract::State;
use axum::response::Json;
use chrono::{DateTime, Utc};
use futures_util::future::try_join_all;
use serde::Serialize;
use superkick_core::{
    AttentionStatus, InterruptStatus, LinkedPrSummary, OperatorQueue, QueueInputs, Run, RunState,
    SessionOwnership, classify_queue,
};
use superkick_storage::repo::{AttentionRequestRepo, InterruptRepo, RunRepo};

use crate::AppState;
use crate::error::AppError;
use crate::handlers::runs::resolve_pr_summary;

/// Per-run triage summary shown in the operator queue.
#[derive(Debug, Serialize)]
pub struct QueueRunSummary {
    #[serde(flatten)]
    pub run: Run,
    pub queue: OperatorQueue,
    pub pending_attention_count: usize,
    pub pending_interrupt_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pr: Option<LinkedPrSummary>,
    pub ownership: Vec<SessionOwnership>,
}

#[derive(Debug, Serialize)]
pub struct DashboardQueueResponse {
    pub generated_at: DateTime<Utc>,
    pub groups: BTreeMap<String, Vec<QueueRunSummary>>,
}

/// Keep the `Done` column focused on recently-shipped work. Older completed
/// runs stay visible via the reliability table further down the page.
const DONE_COLUMN_LIMIT: usize = 15;

pub async fn get_queue(
    State(state): State<AppState>,
) -> Result<Json<DashboardQueueResponse>, AppError> {
    let all_runs = state.run_repo.list_all().await?;
    let queue_runs = select_queue_runs(all_runs);

    // Fetch each run's triage signals in parallel — the per-run DB round-trips
    // are independent and sequential awaiting scales linearly with live runs.
    let summaries =
        try_join_all(queue_runs.into_iter().map(|run| build_summary(&state, run))).await?;

    Ok(Json(DashboardQueueResponse {
        generated_at: Utc::now(),
        groups: group_by_queue(summaries),
    }))
}

/// Drop cancelled runs (operator decided not to ship) and cap the completed
/// set so the `Done` column stays a rolling tail rather than a lifetime log.
fn select_queue_runs(runs: Vec<Run>) -> Vec<Run> {
    let (live, mut completed): (Vec<_>, Vec<_>) = runs
        .into_iter()
        .filter(|run| !matches!(run.state, RunState::Cancelled))
        .partition(|run| !matches!(run.state, RunState::Completed));

    completed.sort_by(|a, b| {
        let a_t = a.finished_at.unwrap_or(a.updated_at);
        let b_t = b.finished_at.unwrap_or(b.updated_at);
        b_t.cmp(&a_t)
    });
    completed.truncate(DONE_COLUMN_LIMIT);

    live.into_iter().chain(completed).collect()
}

/// Seed every queue with an empty column so the UI can render placeholders
/// for empty buckets without special-casing missing keys.
fn group_by_queue(summaries: Vec<QueueRunSummary>) -> BTreeMap<String, Vec<QueueRunSummary>> {
    let mut groups: BTreeMap<String, Vec<QueueRunSummary>> = OperatorQueue::ALL
        .iter()
        .map(|queue| (queue.slug().to_string(), Vec::new()))
        .collect();
    for summary in summaries {
        groups
            .entry(summary.queue.slug().to_string())
            .or_default()
            .push(summary);
    }
    groups
}

async fn build_summary(state: &AppState, run: Run) -> Result<QueueRunSummary, AppError> {
    let run_id = run.id;

    let attention = state.attention_repo.list_by_run(run_id).await?;
    let pending_attention_count = attention
        .iter()
        .filter(|request| request.status == AttentionStatus::Pending)
        .count();

    let interrupts = state.interrupt_repo.list_by_run(run_id).await?;
    let pending_interrupt_count = interrupts
        .iter()
        .filter(|interrupt| interrupt.status == InterruptStatus::Pending)
        .count();

    let pr = resolve_pr_summary(state, run_id, &run.repo_slug).await;

    let ownership = match state.ownership_service.snapshots_for_run(run_id).await {
        Ok(snaps) => snaps,
        Err(err) => {
            tracing::warn!(
                run_id = %run_id,
                error = %err,
                "failed to read run ownership snapshots for dashboard queue"
            );
            Vec::new()
        }
    };

    let queue = classify_queue(QueueInputs {
        run: &run,
        pending_attention: pending_attention_count,
        pending_interrupts: pending_interrupt_count,
        pr: pr.as_ref(),
        ownership: &ownership,
    })
    .unwrap_or(OperatorQueue::Active);

    Ok(QueueRunSummary {
        run,
        queue,
        pending_attention_count,
        pending_interrupt_count,
        pr,
        ownership,
    })
}
