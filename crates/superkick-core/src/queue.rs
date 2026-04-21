//! Operator-facing queue classification — SUP-58.
//!
//! Translates live run state, attention requests, interrupts, ownership
//! snapshots, and pull request state into a single actionable bucket an
//! operator can triage from. The queue is derived — never persisted —
//! because the inputs move independently and the operator always reads the
//! freshest snapshot.
//!
//! The intent is to answer the first question an operator has when opening
//! Superkick: *what needs me right now, and what is simply in flight?*
//! Completed or cancelled runs fall off the queue entirely; the reliability
//! view is a separate concern.
//!
//! ## Precedence
//!
//! A run lives in exactly one queue group. `Completed` runs always land in
//! `Done`; `Cancelled` runs drop off the queue entirely. For live runs,
//! when multiple conditions could apply, the most-actionable one wins:
//!
//! 1. `NeedsHuman` — pending attention/interrupt or `WaitingHuman`/`Failed`
//! 2. `BlockedByDependency` — suspended waiting for a handoff to resolve
//! 3. `InPr` — PR is open/draft and the run is past pushing it
//! 4. `Waiting` — queued, not yet picked up
//! 5. `Active` — otherwise in-flight
//!
//! The ordering is stable and intentional: a run with an open PR *and* an
//! unanswered attention request surfaces under `NeedsHuman` because the
//! operator has to act before the PR matters.

use serde::{Deserialize, Serialize};

use crate::ownership::{OrchestrationOwner, SessionOwnership, SuspendReason};
use crate::pull_request::{LinkedPrSummary, PrState};
use crate::run::{Run, RunState};

/// Operator-facing bucket a run falls into.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OperatorQueue {
    Waiting,
    Active,
    InPr,
    Done,
    BlockedByDependency,
    NeedsHuman,
}

impl OperatorQueue {
    /// Fixed ordering used when rendering all columns. Reads left-to-right
    /// as the run lifecycle: queued → in flight → shipped → done, with the
    /// two exception states (blocked, needs-human) trailing. Classification
    /// precedence (most-urgent wins) is separate from display order and
    /// lives in `classify`.
    pub const ALL: [OperatorQueue; 6] = [
        Self::Waiting,
        Self::Active,
        Self::InPr,
        Self::Done,
        Self::BlockedByDependency,
        Self::NeedsHuman,
    ];

    #[must_use]
    pub const fn slug(self) -> &'static str {
        match self {
            Self::Waiting => "waiting",
            Self::Active => "active",
            Self::InPr => "in-pr",
            Self::Done => "done",
            Self::BlockedByDependency => "blocked-by-dependency",
            Self::NeedsHuman => "needs-human",
        }
    }
}

/// Inputs to classification. Cheap to construct per run from the repos the
/// API already uses — no additional storage needed.
#[derive(Debug, Clone, Copy)]
pub struct QueueInputs<'a> {
    pub run: &'a Run,
    pub pending_attention: usize,
    pub pending_interrupts: usize,
    pub pr: Option<&'a LinkedPrSummary>,
    pub ownership: &'a [SessionOwnership],
}

impl QueueInputs<'_> {
    fn has_pending_handoff(&self) -> bool {
        self.ownership.iter().any(|o| {
            matches!(
                &o.orchestration,
                OrchestrationOwner::Suspended {
                    reason: SuspendReason::PendingHandoff { .. }
                }
            )
        })
    }

    fn has_open_pr(&self) -> bool {
        self.pr
            .map(|pr| matches!(pr.state, PrState::Open | PrState::Draft))
            .unwrap_or(false)
    }
}

/// Classify a run into exactly one operator queue. `Cancelled` runs return
/// `None` — they drop off the queue because the operator already decided
/// not to ship them. `Completed` runs land in `Done` so the happy-path
/// flow reads left-to-right on the board. `Failed` stays actionable
/// (NeedsHuman) until explicitly retried or archived.
pub fn classify(inputs: QueueInputs<'_>) -> Option<OperatorQueue> {
    let state = inputs.run.state;

    if matches!(state, RunState::Cancelled) {
        return None;
    }

    if matches!(state, RunState::Completed) {
        return Some(OperatorQueue::Done);
    }

    if inputs.pending_attention > 0
        || inputs.pending_interrupts > 0
        || matches!(state, RunState::WaitingHuman | RunState::Failed)
    {
        return Some(OperatorQueue::NeedsHuman);
    }

    if inputs.has_pending_handoff() {
        return Some(OperatorQueue::BlockedByDependency);
    }

    if inputs.has_open_pr() {
        return Some(OperatorQueue::InPr);
    }

    if matches!(state, RunState::Queued) {
        return Some(OperatorQueue::Waiting);
    }

    Some(OperatorQueue::Active)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::id::{AgentSessionId, AttentionRequestId, HandoffId};
    use crate::ownership::{OrchestrationOwner, SessionOwnership, SuspendReason};
    use crate::run::{ExecutionMode, Run, TriggerSource};

    fn run_in_state(state: RunState) -> Run {
        let mut r = Run::new(
            "issue-1".into(),
            "SUP-1".into(),
            "owner/repo".into(),
            TriggerSource::Manual,
            ExecutionMode::FullAuto,
            "main".into(),
            false,
            None,
        );
        r.state = state;
        r
    }

    fn inputs(run: &Run) -> QueueInputs<'_> {
        QueueInputs {
            run,
            pending_attention: 0,
            pending_interrupts: 0,
            pr: None,
            ownership: &[],
        }
    }

    fn suspended_snapshot(run: &Run, reason: SuspendReason) -> SessionOwnership {
        SessionOwnership {
            session_id: AgentSessionId::new(),
            run_id: run.id,
            orchestration: OrchestrationOwner::Suspended { reason },
            since: chrono::Utc::now(),
            writer: None,
        }
    }

    #[test]
    fn cancelled_runs_drop_off_the_queue() {
        let cancelled = run_in_state(RunState::Cancelled);
        assert!(classify(inputs(&cancelled)).is_none());
    }

    #[test]
    fn completed_runs_surface_in_done() {
        let completed = run_in_state(RunState::Completed);
        assert_eq!(classify(inputs(&completed)), Some(OperatorQueue::Done));
    }

    #[test]
    fn waiting_human_state_is_needs_human() {
        let run = run_in_state(RunState::WaitingHuman);
        assert_eq!(classify(inputs(&run)), Some(OperatorQueue::NeedsHuman));
    }

    #[test]
    fn failed_is_needs_human_until_retried() {
        let run = run_in_state(RunState::Failed);
        assert_eq!(classify(inputs(&run)), Some(OperatorQueue::NeedsHuman));
    }

    #[test]
    fn pending_attention_wins_over_everything() {
        let run = run_in_state(RunState::Coding);
        let pr = LinkedPrSummary {
            number: 1,
            url: "https://example/pr/1".into(),
            state: PrState::Open,
            merged_at: None,
        };
        let snap = suspended_snapshot(
            &run,
            SuspendReason::PendingHandoff {
                handoff_id: HandoffId::new(),
            },
        );
        let mut i = inputs(&run);
        i.pending_attention = 1;
        i.pr = Some(&pr);
        i.ownership = std::slice::from_ref(&snap);
        assert_eq!(classify(i), Some(OperatorQueue::NeedsHuman));
    }

    #[test]
    fn pending_interrupts_surface_as_needs_human() {
        let run = run_in_state(RunState::Coding);
        let mut i = inputs(&run);
        i.pending_interrupts = 1;
        assert_eq!(classify(i), Some(OperatorQueue::NeedsHuman));
    }

    #[test]
    fn pending_handoff_is_blocked_by_dependency() {
        let run = run_in_state(RunState::Coding);
        let snap = suspended_snapshot(
            &run,
            SuspendReason::PendingHandoff {
                handoff_id: HandoffId::new(),
            },
        );
        let mut i = inputs(&run);
        i.ownership = std::slice::from_ref(&snap);
        assert_eq!(classify(i), Some(OperatorQueue::BlockedByDependency));
    }

    #[test]
    fn attention_suspend_does_not_count_as_dependency_block() {
        let run = run_in_state(RunState::Coding);
        let snap = suspended_snapshot(
            &run,
            SuspendReason::AttentionRequested {
                attention_id: AttentionRequestId::new(),
            },
        );
        let mut i = inputs(&run);
        i.ownership = std::slice::from_ref(&snap);
        // Without pending_attention > 0 the run is still Active — the
        // attention request drives NeedsHuman, not the suspend reason alone.
        assert_eq!(classify(i), Some(OperatorQueue::Active));
    }

    #[test]
    fn open_pr_bucket() {
        let run = run_in_state(RunState::OpeningPr);
        let pr = LinkedPrSummary {
            number: 1,
            url: "https://example/pr/1".into(),
            state: PrState::Open,
            merged_at: None,
        };
        let mut i = inputs(&run);
        i.pr = Some(&pr);
        assert_eq!(classify(i), Some(OperatorQueue::InPr));
    }

    #[test]
    fn draft_pr_also_counts_as_in_pr() {
        let run = run_in_state(RunState::Reviewing);
        let pr = LinkedPrSummary {
            number: 1,
            url: "https://example/pr/1".into(),
            state: PrState::Draft,
            merged_at: None,
        };
        let mut i = inputs(&run);
        i.pr = Some(&pr);
        assert_eq!(classify(i), Some(OperatorQueue::InPr));
    }

    #[test]
    fn merged_pr_does_not_keep_run_in_pr_bucket() {
        let run = run_in_state(RunState::OpeningPr);
        let pr = LinkedPrSummary {
            number: 1,
            url: "https://example/pr/1".into(),
            state: PrState::Merged,
            merged_at: None,
        };
        let mut i = inputs(&run);
        i.pr = Some(&pr);
        // Merged PR on a non-terminal run is unusual but still tracks as Active.
        assert_eq!(classify(i), Some(OperatorQueue::Active));
    }

    #[test]
    fn queued_is_waiting() {
        let run = run_in_state(RunState::Queued);
        assert_eq!(classify(inputs(&run)), Some(OperatorQueue::Waiting));
    }

    #[test]
    fn in_flight_without_signals_is_active() {
        for state in [
            RunState::Preparing,
            RunState::Planning,
            RunState::Coding,
            RunState::RunningCommands,
            RunState::Reviewing,
            RunState::OpeningPr,
        ] {
            let run = run_in_state(state);
            assert_eq!(classify(inputs(&run)), Some(OperatorQueue::Active));
        }
    }
}
