//! Shared per-run triage fan-out for the operator dashboard (SUP-58) and the
//! launch queue (SUP-80). Both surfaces need the same signals — pending
//! attention, pending interrupts, PR state, ownership snapshots, operator
//! bucket — so that bucketing and reason strings stay consistent. Keeping the
//! fan-out in one place prevents the horizon and the classifier inputs from
//! drifting between the two handlers.

use std::sync::Arc;

use chrono::Utc;
use futures_util::future::try_join_all;
use tracing::warn;

use superkick_core::{
    AttentionStatus, InterruptStatus, LinkedPrSummary, OperatorQueue, QueueInputs, Run, RunId,
    SessionOwnership, StalledReason, classify_queue, queue_card_reason, trim_for_queue,
};
use superkick_storage::repo::{
    ArtifactRepo, AttentionRequestRepo, InterruptRepo, PullRequestRepo, RunRepo,
    SessionOwnershipRepo,
};
use superkick_storage::{RecoveryEventRow, SqliteRecoveryEventRepo};

use crate::ownership_service::OwnershipService;
use crate::pull_request_service::PullRequestService;

/// Per-run triage bundle used by both queue surfaces. The `reason` is built
/// via `queue_card_reason` so the dashboard card and the launch-queue card
/// read exactly the same string for the same run.
#[derive(Debug, Clone)]
pub struct RunTriage {
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

pub struct QueueTriageService<R, A, I, OwnR, OwnE, P, Art>
where
    R: RunRepo + 'static,
    A: AttentionRequestRepo + 'static,
    I: InterruptRepo + 'static,
    OwnR: SessionOwnershipRepo + 'static,
    OwnE: superkick_storage::repo::RunEventRepo + 'static,
    P: PullRequestRepo + 'static,
    Art: ArtifactRepo + 'static,
{
    run_repo: Arc<R>,
    attention_repo: Arc<A>,
    interrupt_repo: Arc<I>,
    pr_service: Arc<PullRequestService<P, Art>>,
    recovery_event_repo: Arc<SqliteRecoveryEventRepo>,
    ownership_service: Arc<OwnershipService<OwnR, OwnE>>,
}

impl<R, A, I, OwnR, OwnE, P, Art> QueueTriageService<R, A, I, OwnR, OwnE, P, Art>
where
    R: RunRepo + 'static,
    A: AttentionRequestRepo + 'static,
    I: InterruptRepo + 'static,
    OwnR: SessionOwnershipRepo + 'static,
    OwnE: superkick_storage::repo::RunEventRepo + 'static,
    P: PullRequestRepo + 'static,
    Art: ArtifactRepo + 'static,
{
    pub fn new(
        run_repo: Arc<R>,
        attention_repo: Arc<A>,
        interrupt_repo: Arc<I>,
        pr_service: Arc<PullRequestService<P, Art>>,
        recovery_event_repo: Arc<SqliteRecoveryEventRepo>,
        ownership_service: Arc<OwnershipService<OwnR, OwnE>>,
    ) -> Arc<Self> {
        Arc::new(Self {
            run_repo,
            attention_repo,
            interrupt_repo,
            pr_service,
            recovery_event_repo,
            ownership_service,
        })
    }

    /// Load and bucket every run visible in the operator queues. Drops
    /// cancelled runs and trims the completed tail via [`trim_for_queue`] so
    /// the two surfaces share the same horizon, then fans out in parallel to
    /// fetch the per-run signals.
    pub async fn load_triages(&self) -> anyhow::Result<Vec<RunTriage>> {
        let all_runs = self.run_repo.list_all().await?;
        let runs = trim_for_queue(all_runs);
        try_join_all(runs.into_iter().map(|run| self.load_triage(run))).await
    }

    async fn load_triage(&self, run: Run) -> anyhow::Result<RunTriage> {
        let run_id = run.id;

        let attention = self.attention_repo.list_by_run(run_id).await?;
        let pending_attention_count = attention
            .iter()
            .filter(|r| r.status == AttentionStatus::Pending)
            .count();

        let interrupts = self.interrupt_repo.list_by_run(run_id).await?;
        let pending_interrupt_count = interrupts
            .iter()
            .filter(|i| i.status == InterruptStatus::Pending)
            .count();

        let pr = self
            .pr_service
            .resolve_pr_summary(run_id, &run.repo_slug)
            .await;

        let ownership = match self.ownership_service.snapshots_for_run(run_id).await {
            Ok(snaps) => snaps,
            Err(err) => {
                warn!(
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

        // Terminal runs (Completed / Failed / Cancelled) drop out of the
        // recovery scheduler's candidate set, so no `recovered` audit row is
        // ever written to close out a prior `stalled` row. Without this clamp,
        // a run that stalled and then completed would render a permanent
        // "Stalled · Xm" badge in the dashboard's Done column with the
        // duration ticking forever.
        let (stalled_for_seconds, stalled_reason) = if run.state.is_terminal() {
            (None, None)
        } else {
            match self.recovery_event_repo.current_stall(run_id).await {
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
}

/// Project a `current_stall` audit row onto the dashboard's annotation pair.
/// `stalled_for_seconds` is measured from the classifier's `since` (the
/// freshest underlying signal at decision time) so the duration reflects how
/// long the run has actually been silent — not how long since the scheduler
/// first noticed. The CHECK constraint on the migration guarantees a stalled
/// row carries both `reason` JSON and `stalled_since`; the defensive guards
/// below shouldn't fire in practice but keep the dashboard rendering instead
/// of hiding the badge if the schema invariant ever drifts.
fn stall_annotation(run_id: RunId, row: RecoveryEventRow) -> (Option<u64>, Option<StalledReason>) {
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
