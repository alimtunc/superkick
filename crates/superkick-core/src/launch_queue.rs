//! Launch-queue classification — SUP-80.
//!
//! The launch queue is a derived snapshot that merges (a) Linear issues
//! currently tracked by Superkick and (b) Superkick runs (live or recently
//! finished) into one of eight buckets: `launchable`, `waiting-capacity`,
//! `waiting-approval`, `blocked`, `active`, `needs-human`, `in-pr`, `done`.
//! Every item carries a human-readable `reason` so the operator never has to
//! guess why something sits where it does.
//!
//! ## Intent
//!
//! This is the *intake* view — "what can I launch, and why not?" — separate
//! from the operator dashboard (SUP-58), which is the *ops* view of runs
//! already in flight. The two queues deliberately do not merge: one is about
//! deciding what work to start, the other about triaging what's running.
//!
//! ## Purity
//!
//! `classify_launch_queue` is a pure function of its three inputs. No IO, no
//! async, no shared state. That lets a future scheduler tick call it on a
//! cron without introducing a "second backlog system" (SUP-80 explicitly
//! excludes auto-dispatch — this ticket only adds the classification and a
//! manual dispatch endpoint).
//!
//! ## Precedence
//!
//! For an issue without an active run, the first matching gate wins:
//!
//! 1. Parent issue is not terminal in Linear (`state_type` ∉ {`completed`,
//!    `canceled`}) → `blocked` with reason `"parent <ID> not completed"`.
//! 2. Parent has an active Superkick run → `blocked` with reason
//!    `"parent <ID> has active run <run-id>"`.
//! 3. Linear state does not match the configured trigger state → `blocked`
//!    with reason `"linear status is '<name>', trigger requires '<state>'"`.
//! 4. Priority is in `approval_required_priorities` → `waiting-approval`.
//! 5. Active-run cap is reached → `waiting-capacity`.
//! 6. Otherwise → `launchable`.
//!
//! Runs are mapped 1:1 from their `OperatorQueue` classification:
//! `Waiting`/`Active` → `Active`, `InPr` → `InPr`, `Done` → `Done`,
//! `NeedsHuman` → `NeedsHuman`, `BlockedByDependency` → `Blocked`.

use serde::{Deserialize, Serialize};

use crate::id::RunId;
use crate::queue::OperatorQueue;
use crate::run::RunState;

/// Linear state types that count as "parent resolved" for dependency
/// blocking. Anything outside this set blocks its children.
const TERMINAL_LINEAR_STATE_TYPES: [&str; 2] = ["completed", "canceled"];

/// Operator-facing launch-queue bucket.
///
/// Runs and issues both classify into exactly one variant. Fixed ordering
/// (`ALL`) is the display order for columns left-to-right: what can go →
/// what's paused → what's running → what's shipped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LaunchQueue {
    Launchable,
    WaitingCapacity,
    WaitingApproval,
    Blocked,
    Active,
    NeedsHuman,
    InPr,
    Done,
}

impl LaunchQueue {
    /// Canonical left-to-right display order for the UI. Matches criterion 6
    /// of SUP-80: the route `/queue` renders the 8 columns in this order.
    pub const ALL: [LaunchQueue; 8] = [
        Self::Launchable,
        Self::WaitingCapacity,
        Self::WaitingApproval,
        Self::Blocked,
        Self::Active,
        Self::NeedsHuman,
        Self::InPr,
        Self::Done,
    ];

    #[must_use]
    pub const fn slug(self) -> &'static str {
        match self {
            Self::Launchable => "launchable",
            Self::WaitingCapacity => "waiting-capacity",
            Self::WaitingApproval => "waiting-approval",
            Self::Blocked => "blocked",
            Self::Active => "active",
            Self::NeedsHuman => "needs-human",
            Self::InPr => "in-pr",
            Self::Done => "done",
        }
    }
}

/// Minimal issue projection used for classification. The handler keeps the
/// full Linear payload around to build the wire response — the classifier
/// only needs the fields that drive bucketing.
#[derive(Debug, Clone)]
pub struct QueueIssueInput {
    pub id: String,
    pub identifier: String,
    /// Linear workflow `state.type` — one of `backlog` / `unstarted` /
    /// `started` / `completed` / `canceled`.
    pub state_type: String,
    /// Human label for the linear state — used in `reason` strings so the
    /// operator reads "linear status is 'In Progress'" rather than the raw
    /// slug.
    pub state_name: String,
    pub priority_value: u8,
    /// Identifier (e.g. `SUP-10`) of the parent issue, if any.
    pub parent_identifier: Option<String>,
    /// State type of the parent, if any. Hydrated by the Linear GraphQL
    /// query so we don't per-parent round-trip.
    pub parent_state_type: Option<String>,
}

/// Minimal run projection used for classification. The handler has already
/// computed the operator-queue bucket (SUP-58) per run by the time this
/// input is built — the classifier only maps it onto the launch-queue
/// vocabulary.
#[derive(Debug, Clone)]
pub struct QueueRunInput {
    pub run_id: RunId,
    pub issue_identifier: String,
    pub state: RunState,
    pub operator_bucket: OperatorQueue,
    /// Short operator-facing summary built by the handler (e.g. `"run in
    /// state Coding"`, `"1 attention request pending"`). Carried verbatim
    /// into the launch-queue reason.
    pub reason: String,
}

/// Config inputs extracted from `OrchestrationConfig`. Lives in core so the
/// classifier stays independent of `superkick-config`.
#[derive(Debug, Clone, Copy)]
pub struct OrchestrationInputs<'a> {
    pub max_concurrent_active_runs: u32,
    pub approval_required_priorities: &'a [u8],
    /// Linear workflow state type that promotes an issue from "tracked" to
    /// "triggerable" — e.g. `"started"` for `issue_source.trigger: in_progress`.
    /// Threaded through so the classifier is coupled to the config's trigger
    /// enum at compile time rather than via a shared constant.
    pub trigger_state_type: &'a str,
}

/// Verdict for one Linear issue. `linked_run_id` is `Some` when the issue
/// has a live Superkick run; the UI can decide whether to render the issue
/// card on its own or collapsed into the run card.
#[derive(Debug, Clone, Serialize)]
pub struct ClassifiedIssue {
    pub id: String,
    pub identifier: String,
    pub bucket: LaunchQueue,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_run_id: Option<RunId>,
}

/// Verdict for one Superkick run.
#[derive(Debug, Clone, Serialize)]
pub struct ClassifiedRun {
    pub run_id: RunId,
    pub issue_identifier: String,
    pub bucket: LaunchQueue,
    pub reason: String,
}

/// Full classification output. `active_capacity_*` is a derived capacity
/// counter the UI banner needs — kept alongside the verdicts so readers
/// don't re-scan the runs slice to compute it.
#[derive(Debug, Clone, Serialize)]
pub struct LaunchQueueClassification {
    pub issues: Vec<ClassifiedIssue>,
    pub runs: Vec<ClassifiedRun>,
    pub active_capacity_current: u32,
    pub active_capacity_max: u32,
}

/// Pure classifier. Stable for the same `(issues, runs, config)` snapshot —
/// rerunning with the same inputs returns equal output (criterion 9:
/// "transitions idempotentes").
pub fn classify_launch_queue(
    issues: Vec<QueueIssueInput>,
    runs: Vec<QueueRunInput>,
    orchestration: &OrchestrationInputs<'_>,
) -> LaunchQueueClassification {
    let active_runs = active_run_count(&runs);
    let capacity_reached = active_runs >= orchestration.max_concurrent_active_runs;

    let classified_runs: Vec<ClassifiedRun> = runs
        .iter()
        .map(|r| ClassifiedRun {
            run_id: r.run_id,
            issue_identifier: r.issue_identifier.clone(),
            bucket: map_operator_bucket(r.operator_bucket),
            reason: r.reason.clone(),
        })
        .collect();

    let classified_issues: Vec<ClassifiedIssue> = issues
        .into_iter()
        .map(|issue| classify_issue(issue, &runs, orchestration, active_runs, capacity_reached))
        .collect();

    LaunchQueueClassification {
        issues: classified_issues,
        runs: classified_runs,
        active_capacity_current: active_runs,
        active_capacity_max: orchestration.max_concurrent_active_runs,
    }
}

fn classify_issue(
    issue: QueueIssueInput,
    runs: &[QueueRunInput],
    orchestration: &OrchestrationInputs<'_>,
    active_runs: u32,
    capacity_reached: bool,
) -> ClassifiedIssue {
    // If a live run already exists for this issue, surface it — the run
    // carries the authoritative bucket, so the issue card's role is just
    // to point at the run (one bucket per pair, no double-counting).
    if let Some(run) = find_active_run_for(runs, &issue.identifier) {
        let bucket = map_operator_bucket(run.operator_bucket);
        return ClassifiedIssue {
            id: issue.id,
            identifier: issue.identifier,
            bucket,
            reason: run.reason.clone(),
            linked_run_id: Some(run.run_id),
        };
    }

    // Precedence cascade — first match wins. Order justified in module
    // docs; tests pin every branch.
    let parent = issue
        .parent_identifier
        .as_deref()
        .zip(issue.parent_state_type.as_deref());
    if let Some((parent_id, parent_state)) = parent
        && !is_terminal_linear_state(parent_state)
    {
        let reason = format!("parent {parent_id} not completed (status: {parent_state})");
        return blocked(issue, reason);
    }

    if let Some(parent_id) = issue.parent_identifier.as_deref()
        && let Some(parent_run) = find_active_run_for(runs, parent_id)
    {
        let reason = format!("parent {parent_id} has active run {}", parent_run.run_id);
        return blocked(issue, reason);
    }

    let trigger = orchestration.trigger_state_type;
    if issue.state_type != trigger {
        let state_name = issue.state_name.clone();
        return blocked(
            issue,
            format!("linear status is '{state_name}', trigger requires '{trigger}'"),
        );
    }

    if orchestration
        .approval_required_priorities
        .contains(&issue.priority_value)
    {
        return ClassifiedIssue {
            id: issue.id,
            identifier: issue.identifier,
            bucket: LaunchQueue::WaitingApproval,
            reason: format!("priority {} requires manual approval", issue.priority_value),
            linked_run_id: None,
        };
    }

    if capacity_reached {
        return ClassifiedIssue {
            id: issue.id,
            identifier: issue.identifier,
            bucket: LaunchQueue::WaitingCapacity,
            reason: format!(
                "concurrency cap reached: {active_runs}/{}",
                orchestration.max_concurrent_active_runs
            ),
            linked_run_id: None,
        };
    }

    ClassifiedIssue {
        id: issue.id,
        identifier: issue.identifier,
        bucket: LaunchQueue::Launchable,
        reason: format!(
            "in-progress issue with no active run; capacity {active_runs}/{}",
            orchestration.max_concurrent_active_runs
        ),
        linked_run_id: None,
    }
}

fn blocked(issue: QueueIssueInput, reason: String) -> ClassifiedIssue {
    ClassifiedIssue {
        id: issue.id,
        identifier: issue.identifier,
        bucket: LaunchQueue::Blocked,
        reason,
        linked_run_id: None,
    }
}

fn is_terminal_linear_state(state_type: &str) -> bool {
    TERMINAL_LINEAR_STATE_TYPES.contains(&state_type)
}

fn find_active_run_for<'a>(
    runs: &'a [QueueRunInput],
    issue_identifier: &str,
) -> Option<&'a QueueRunInput> {
    runs.iter()
        .find(|r| r.issue_identifier == issue_identifier && !r.state.is_terminal())
}

/// How many runs are currently counted as "active" for capacity accounting.
/// Saturates at `u32::MAX` on impossibly large counts so callers don't have
/// to pattern-match a truncation error that can never happen in practice.
fn active_run_count(runs: &[QueueRunInput]) -> u32 {
    u32::try_from(runs.iter().filter(|r| !r.state.is_terminal()).count()).unwrap_or(u32::MAX)
}

/// Project an `OperatorQueue` bucket onto the launch-queue vocabulary.
/// `Waiting` runs live under `Active` in the launch-queue view because from
/// the launch-intake POV a queued run is already "past the gate" — the
/// distinction between queued and executing belongs in the ops dashboard,
/// not the intake board.
fn map_operator_bucket(bucket: OperatorQueue) -> LaunchQueue {
    match bucket {
        OperatorQueue::Waiting | OperatorQueue::Active => LaunchQueue::Active,
        OperatorQueue::InPr => LaunchQueue::InPr,
        OperatorQueue::Done => LaunchQueue::Done,
        OperatorQueue::NeedsHuman => LaunchQueue::NeedsHuman,
        OperatorQueue::BlockedByDependency => LaunchQueue::Blocked,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::id::RunId;

    fn issue(identifier: &str, state_type: &str) -> QueueIssueInput {
        QueueIssueInput {
            id: format!("{identifier}-id"),
            identifier: identifier.to_string(),
            state_type: state_type.to_string(),
            state_name: state_type.to_string(),
            priority_value: 3,
            parent_identifier: None,
            parent_state_type: None,
        }
    }

    fn run(issue_identifier: &str, state: RunState, op: OperatorQueue) -> QueueRunInput {
        QueueRunInput {
            run_id: RunId::new(),
            issue_identifier: issue_identifier.to_string(),
            state,
            operator_bucket: op,
            reason: format!("run in state {state}"),
        }
    }

    fn default_orchestration() -> OrchestrationInputs<'static> {
        OrchestrationInputs {
            max_concurrent_active_runs: 3,
            approval_required_priorities: &[],
            trigger_state_type: "started",
        }
    }

    #[test]
    fn every_bucket_has_a_stable_slug() {
        for bucket in LaunchQueue::ALL {
            assert!(!bucket.slug().is_empty());
        }
        assert_eq!(LaunchQueue::ALL.len(), 8);
    }

    #[test]
    fn started_issue_with_capacity_is_launchable() {
        let out = classify_launch_queue(
            vec![issue("SUP-1", "started")],
            vec![],
            &default_orchestration(),
        );

        assert_eq!(out.issues.len(), 1);
        assert_eq!(out.issues[0].bucket, LaunchQueue::Launchable);
        assert_eq!(out.active_capacity_current, 0);
        assert_eq!(out.active_capacity_max, 3);
    }

    #[test]
    fn unstarted_issue_blocks_with_trigger_reason() {
        let out = classify_launch_queue(
            vec![issue("SUP-1", "unstarted")],
            vec![],
            &default_orchestration(),
        );

        assert_eq!(out.issues[0].bucket, LaunchQueue::Blocked);
        assert!(out.issues[0].reason.contains("trigger requires 'started'"));
    }

    #[test]
    fn backlog_issue_blocks_with_trigger_reason() {
        let out = classify_launch_queue(
            vec![issue("SUP-1", "backlog")],
            vec![],
            &default_orchestration(),
        );

        assert_eq!(out.issues[0].bucket, LaunchQueue::Blocked);
    }

    #[test]
    fn parent_not_completed_wins_over_trigger_gate() {
        let mut i = issue("SUP-11", "started");
        i.parent_identifier = Some("SUP-10".into());
        i.parent_state_type = Some("started".into());

        let out = classify_launch_queue(vec![i], vec![], &default_orchestration());

        assert_eq!(out.issues[0].bucket, LaunchQueue::Blocked);
        assert!(out.issues[0].reason.contains("parent SUP-10 not completed"));
    }

    #[test]
    fn parent_completed_does_not_block_child() {
        let mut i = issue("SUP-11", "started");
        i.parent_identifier = Some("SUP-10".into());
        i.parent_state_type = Some("completed".into());

        let out = classify_launch_queue(vec![i], vec![], &default_orchestration());

        assert_eq!(out.issues[0].bucket, LaunchQueue::Launchable);
    }

    #[test]
    fn parent_cancelled_does_not_block_child() {
        let mut i = issue("SUP-11", "started");
        i.parent_identifier = Some("SUP-10".into());
        i.parent_state_type = Some("canceled".into());

        let out = classify_launch_queue(vec![i], vec![], &default_orchestration());

        assert_eq!(out.issues[0].bucket, LaunchQueue::Launchable);
    }

    #[test]
    fn parent_with_active_superkick_run_blocks_child() {
        let mut child = issue("SUP-11", "started");
        child.parent_identifier = Some("SUP-10".into());
        child.parent_state_type = Some("completed".into());
        let parent_run = run("SUP-10", RunState::Coding, OperatorQueue::Active);

        let out = classify_launch_queue(vec![child], vec![parent_run], &default_orchestration());

        assert_eq!(out.issues[0].bucket, LaunchQueue::Blocked);
        assert!(
            out.issues[0]
                .reason
                .contains("parent SUP-10 has active run")
        );
    }

    #[test]
    fn issue_with_active_run_adopts_run_bucket() {
        let the_run = run("SUP-1", RunState::Coding, OperatorQueue::Active);
        let run_id = the_run.run_id;

        let out = classify_launch_queue(
            vec![issue("SUP-1", "started")],
            vec![the_run],
            &default_orchestration(),
        );

        assert_eq!(out.issues[0].bucket, LaunchQueue::Active);
        assert_eq!(out.issues[0].linked_run_id, Some(run_id));
        assert_eq!(out.runs[0].bucket, LaunchQueue::Active);
    }

    #[test]
    fn run_with_needs_human_bucket_surfaces_as_needs_human() {
        let out = classify_launch_queue(
            vec![],
            vec![run(
                "SUP-1",
                RunState::WaitingHuman,
                OperatorQueue::NeedsHuman,
            )],
            &default_orchestration(),
        );

        assert_eq!(out.runs[0].bucket, LaunchQueue::NeedsHuman);
    }

    #[test]
    fn run_with_in_pr_bucket_surfaces_as_in_pr() {
        let out = classify_launch_queue(
            vec![],
            vec![run("SUP-1", RunState::OpeningPr, OperatorQueue::InPr)],
            &default_orchestration(),
        );

        assert_eq!(out.runs[0].bucket, LaunchQueue::InPr);
    }

    #[test]
    fn completed_run_surfaces_as_done() {
        let out = classify_launch_queue(
            vec![],
            vec![run("SUP-1", RunState::Completed, OperatorQueue::Done)],
            &default_orchestration(),
        );

        assert_eq!(out.runs[0].bucket, LaunchQueue::Done);
        // Terminal run does not count against capacity.
        assert_eq!(out.active_capacity_current, 0);
    }

    #[test]
    fn queued_run_surfaces_as_active_and_counts_toward_capacity() {
        let out = classify_launch_queue(
            vec![],
            vec![run("SUP-1", RunState::Queued, OperatorQueue::Waiting)],
            &default_orchestration(),
        );

        assert_eq!(out.runs[0].bucket, LaunchQueue::Active);
        assert_eq!(out.active_capacity_current, 1);
    }

    #[test]
    fn capacity_reached_pushes_triggerable_issue_to_waiting_capacity() {
        let runs = vec![
            run("SUP-1", RunState::Coding, OperatorQueue::Active),
            run("SUP-2", RunState::Planning, OperatorQueue::Active),
            run("SUP-3", RunState::Coding, OperatorQueue::Active),
        ];
        let orchestration = OrchestrationInputs {
            max_concurrent_active_runs: 3,
            approval_required_priorities: &[],
            trigger_state_type: "started",
        };

        let out = classify_launch_queue(vec![issue("SUP-4", "started")], runs, &orchestration);

        assert_eq!(out.issues[0].bucket, LaunchQueue::WaitingCapacity);
        assert!(out.issues[0].reason.contains("concurrency cap reached"));
        assert_eq!(out.active_capacity_current, 3);
    }

    #[test]
    fn capacity_exactly_one_below_still_launchable() {
        let runs = vec![
            run("SUP-1", RunState::Coding, OperatorQueue::Active),
            run("SUP-2", RunState::Coding, OperatorQueue::Active),
        ];

        let out = classify_launch_queue(
            vec![issue("SUP-3", "started")],
            runs,
            &default_orchestration(),
        );

        assert_eq!(out.issues[0].bucket, LaunchQueue::Launchable);
    }

    #[test]
    fn approval_required_priority_forces_waiting_approval() {
        let mut i = issue("SUP-1", "started");
        i.priority_value = 1; // Urgent

        let orchestration = OrchestrationInputs {
            max_concurrent_active_runs: 3,
            approval_required_priorities: &[1],
            trigger_state_type: "started",
        };

        let out = classify_launch_queue(vec![i], vec![], &orchestration);

        assert_eq!(out.issues[0].bucket, LaunchQueue::WaitingApproval);
    }

    #[test]
    fn approval_only_applies_to_listed_priorities() {
        let mut i = issue("SUP-1", "started");
        i.priority_value = 3;
        let orchestration = OrchestrationInputs {
            max_concurrent_active_runs: 3,
            approval_required_priorities: &[1, 2],
            trigger_state_type: "started",
        };

        let out = classify_launch_queue(vec![i], vec![], &orchestration);

        assert_eq!(out.issues[0].bucket, LaunchQueue::Launchable);
    }

    #[test]
    fn approval_wins_over_capacity_when_both_apply() {
        let mut i = issue("SUP-4", "started");
        i.priority_value = 1;
        let runs = vec![
            run("SUP-1", RunState::Coding, OperatorQueue::Active),
            run("SUP-2", RunState::Coding, OperatorQueue::Active),
            run("SUP-3", RunState::Coding, OperatorQueue::Active),
        ];
        let orchestration = OrchestrationInputs {
            max_concurrent_active_runs: 3,
            approval_required_priorities: &[1],
            trigger_state_type: "started",
        };

        let out = classify_launch_queue(vec![i], runs, &orchestration);

        assert_eq!(out.issues[0].bucket, LaunchQueue::WaitingApproval);
    }

    #[test]
    fn blocked_by_dependency_run_is_blocked() {
        let out = classify_launch_queue(
            vec![],
            vec![run(
                "SUP-1",
                RunState::Coding,
                OperatorQueue::BlockedByDependency,
            )],
            &default_orchestration(),
        );

        assert_eq!(out.runs[0].bucket, LaunchQueue::Blocked);
    }

    #[test]
    fn classification_is_idempotent_for_same_inputs() {
        let make = || {
            let mut i = issue("SUP-11", "started");
            i.parent_identifier = Some("SUP-10".into());
            i.parent_state_type = Some("started".into());
            classify_launch_queue(
                vec![i],
                vec![run("SUP-99", RunState::Coding, OperatorQueue::Active)],
                &default_orchestration(),
            )
        };

        let a = make();
        let b = make();
        assert_eq!(a.issues[0].bucket, b.issues[0].bucket);
        assert_eq!(a.issues[0].reason, b.issues[0].reason);
        assert_eq!(a.runs[0].bucket, b.runs[0].bucket);
        assert_eq!(a.active_capacity_current, b.active_capacity_current);
    }
}
