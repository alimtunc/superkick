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
use serde::Serialize;
use superkick_core::{LinkedPrSummary, OperatorQueue, Run, SessionOwnership, StalledReason};

use crate::AppState;
use crate::error::AppError;
use crate::handlers::queue_common::{RunTriage, load_triages};

/// Per-run triage summary shown in the operator queue.
#[derive(Debug, Serialize)]
pub struct QueueRunSummary {
    #[serde(flatten)]
    pub run: Run,
    pub queue: OperatorQueue,
    /// One-line operator-facing reason — produced server-side by the shared
    /// `queue_card_reason` so the dashboard and the launch queue read the
    /// same text for the same run.
    pub reason: String,
    pub pending_attention_count: usize,
    pub pending_interrupt_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pr: Option<LinkedPrSummary>,
    pub ownership: Vec<SessionOwnership>,
    /// SUP-73 — staleness annotation. Both fields are `None` when the run is
    /// healthy. The run still lives in its `queue` bucket; staleness is an
    /// annotation, not a re-classification.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stalled_for_seconds: Option<u64>,
    /// Structured cause from the classifier. Mirrors `StalledReason` so the
    /// UI can humanize per kind (`awaiting_human` → "awaiting human", etc.)
    /// rather than re-parsing a flattened display string.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stalled_reason: Option<StalledReason>,
}

#[derive(Debug, Serialize)]
pub struct DashboardQueueResponse {
    pub generated_at: DateTime<Utc>,
    pub groups: BTreeMap<String, Vec<QueueRunSummary>>,
}

pub async fn get_queue(
    State(state): State<AppState>,
) -> Result<Json<DashboardQueueResponse>, AppError> {
    let triages = load_triages(&state).await?;
    let summaries = triages.into_iter().map(into_summary).collect();

    Ok(Json(DashboardQueueResponse {
        generated_at: Utc::now(),
        groups: group_by_queue(summaries),
    }))
}

fn into_summary(triage: RunTriage) -> QueueRunSummary {
    QueueRunSummary {
        run: triage.run,
        queue: triage.operator_bucket,
        reason: triage.reason,
        pending_attention_count: triage.pending_attention_count,
        pending_interrupt_count: triage.pending_interrupt_count,
        pr: triage.pr,
        ownership: triage.ownership,
        stalled_for_seconds: triage.stalled_for_seconds,
        stalled_reason: triage.stalled_reason,
    }
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
