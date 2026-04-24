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
//! 1. Issue's own Linear state is terminal (`completed` / `canceled`) →
//!    `done`. A sub-issue inherits nothing from its parent here: the Linear
//!    parent/child relation is hierarchy, not dependency (SUP-81).
//! 2. A Linear "blocks" relation gates the issue with a non-terminal
//!    blocker → `blocked`, with a `reason` naming the blocker identifiers
//!    (SUP-81). This is the *only* dependency signal — parent state is
//!    intentionally not checked here.
//! 3. Parent has an active Superkick run → `blocked` with reason
//!    `"parent <ID> has active run <run-id>"`. Kept as a concurrency
//!    guardrail: two Superkick runs on related issues at once tends to
//!    produce merge storms.
//! 4. Linear state does not match the configured trigger state →
//!    `backlog` if `state.type == "backlog"`, otherwise `todo`. These
//!    issues aren't blocked by anything — they simply haven't been moved
//!    to "In Progress" yet. The two buckets mirror Linear's own workflow
//!    groups so the operator's mental model maps 1:1.
//! 5. Priority is in `approval_required_priorities` → `waiting` with reason
//!    `"priority N requires manual approval"`.
//! 6. Active-run cap is reached → `waiting` with reason
//!    `"concurrency cap reached: M/N"`.
//! 7. Otherwise → `launchable`.
//!
//! Blocker resolution is implicit: when a previously non-terminal blocker
//! becomes `completed` / `canceled` (or disappears from the Linear relation
//! set), the next classification pulse returns no gating blocker for the
//! downstream, so it transitions back to `launchable` on its own. The poll
//! diff in `superkick-api` is responsible for the audit event; this module
//! only reads the post-transition state. See `docs/product/unblock-flow.md`.
//!
//! Runs are mapped 1:1 from their `OperatorQueue` classification:
//! `Waiting`/`Active` → `Active`, `InPr` → `InPr`, `Done` → `Done`,
//! `NeedsHuman` → `NeedsHuman`, `BlockedByDependency` → `Blocked`.

use serde::{Deserialize, Serialize};

use crate::blocker::is_terminal_blocker_state;
use crate::id::RunId;
use crate::queue::OperatorQueue;
use crate::run::RunState;

/// Operator-facing launch-queue bucket.
///
/// Runs and issues both classify into exactly one variant. Fixed ordering
/// (`ALL`) is the display order for columns left-to-right and follows the
/// natural Linear → Superkick workflow progression: backlog → todo →
/// launchable → waiting → blocked → running → shipped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LaunchQueue {
    /// Linear `state.type == "backlog"` (SUP-81). Not yet picked up.
    Backlog,
    /// Linear `state.type == "unstarted"` — Linear's "Todo" group (SUP-81).
    /// Picked up but not started; one Linear-side click away from being
    /// triggered for Superkick.
    Todo,
    Launchable,
    /// Held back by an operator-facing gate — capacity cap reached *or*
    /// priority requires manual approval. The two reasons are functionally
    /// the same from the operator's point of view ("can't dispatch right
    /// now"), so SUP-81 collapses them into a single column. The card-level
    /// `reason` string distinguishes the cause when it matters.
    Waiting,
    Blocked,
    Active,
    NeedsHuman,
    InPr,
    Done,
}

impl LaunchQueue {
    /// Canonical left-to-right display order for the UI. Matches the grid
    /// layout of the `/queue` route.
    pub const ALL: [LaunchQueue; 9] = [
        Self::Backlog,
        Self::Todo,
        Self::Launchable,
        Self::Waiting,
        Self::Blocked,
        Self::Active,
        Self::NeedsHuman,
        Self::InPr,
        Self::Done,
    ];

    #[must_use]
    pub const fn slug(self) -> &'static str {
        match self {
            Self::Backlog => "backlog",
            Self::Todo => "todo",
            Self::Launchable => "launchable",
            Self::Waiting => "waiting",
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
    /// Identifier (e.g. `SUP-10`) of the parent issue, if any. Used solely
    /// to detect an active Superkick run on the parent (concurrency
    /// guardrail). Parent state is deliberately NOT tracked: Linear
    /// parent/child is hierarchy, not dependency (SUP-81 — only the
    /// `blocks` relation expresses dependency).
    pub parent_identifier: Option<String>,
    /// Linear "blocks" relations gating this issue (SUP-81). Populated from
    /// the freshly-upserted `issue_blockers` snapshot; terminal blockers are
    /// filtered client-side so the classifier sees only live gates. Empty
    /// vec is the no-blockers case.
    pub blockers: Vec<QueueIssueBlocker>,
}

/// Minimal blocker projection carried alongside a `QueueIssueInput`. Only
/// the identifier and state type drive classification; the title is passed
/// through so the `reason` string reads the same way the UI card does.
#[derive(Debug, Clone)]
pub struct QueueIssueBlocker {
    pub identifier: String,
    /// `"unknown"` for blockers outside the fetched workspace slice (e.g.
    /// cross-team issues the caller lacks access to). Non-terminal by
    /// construction: the classifier keeps the block active and surfaces
    /// "unknown state" in the reason so the operator can arbitrate.
    pub state_type: String,
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

    // Issue's own Linear state wins over everything below: a Done/Cancelled
    // issue belongs in `Done`, not `Blocked`, regardless of parent or
    // blocker state.
    if is_terminal_blocker_state(&issue.state_type) {
        let state_name = issue.state_name.clone();
        return ClassifiedIssue {
            id: issue.id,
            identifier: issue.identifier,
            bucket: LaunchQueue::Done,
            reason: format!("linear status is '{state_name}'"),
            linked_run_id: None,
        };
    }

    // Blocker gate: any non-terminal Linear "blocks" relation keeps the
    // issue in `Blocked`. This is the sole dependency signal — parent state
    // is not checked here (SUP-81: hierarchy ≠ dependency).
    let blocker_reasons: Vec<String> = issue
        .blockers
        .iter()
        .filter(|b| !is_terminal_blocker_state(&b.state_type))
        .map(|b| format!("blocked by {} ({})", b.identifier, b.state_type))
        .collect();
    if !blocker_reasons.is_empty() {
        return blocked(issue, blocker_reasons.join("; "));
    }

    if let Some(parent_id) = issue.parent_identifier.as_deref()
        && let Some(parent_run) = find_active_run_for(runs, parent_id)
    {
        let reason = format!("parent {parent_id} has active run {}", parent_run.run_id);
        return blocked(issue, reason);
    }

    let trigger = orchestration.trigger_state_type;
    if issue.state_type != trigger {
        // Route to the bucket that mirrors Linear's own workflow group.
        // `backlog` → `Backlog`, anything else non-trigger and non-terminal
        // (currently only `unstarted`, future-proofed by defaulting to
        // `Todo`) → `Todo`. Terminal states are handled earlier.
        let bucket = if issue.state_type == "backlog" {
            LaunchQueue::Backlog
        } else {
            LaunchQueue::Todo
        };
        let state_name = issue.state_name.clone();
        return ClassifiedIssue {
            id: issue.id,
            identifier: issue.identifier,
            bucket,
            reason: format!("linear status is '{state_name}'"),
            linked_run_id: None,
        };
    }

    if orchestration
        .approval_required_priorities
        .contains(&issue.priority_value)
    {
        return ClassifiedIssue {
            id: issue.id,
            identifier: issue.identifier,
            bucket: LaunchQueue::Waiting,
            reason: format!("priority {} requires manual approval", issue.priority_value),
            linked_run_id: None,
        };
    }

    if capacity_reached {
        return ClassifiedIssue {
            id: issue.id,
            identifier: issue.identifier,
            bucket: LaunchQueue::Waiting,
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
            blockers: Vec::new(),
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
        assert_eq!(LaunchQueue::ALL.len(), 9);
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
    fn unstarted_issue_lands_in_todo() {
        let out = classify_launch_queue(
            vec![issue("SUP-1", "unstarted")],
            vec![],
            &default_orchestration(),
        );

        assert_eq!(out.issues[0].bucket, LaunchQueue::Todo);
        assert!(out.issues[0].reason.contains("linear status"));
    }

    #[test]
    fn backlog_issue_lands_in_backlog_bucket() {
        let out = classify_launch_queue(
            vec![issue("SUP-1", "backlog")],
            vec![],
            &default_orchestration(),
        );

        assert_eq!(out.issues[0].bucket, LaunchQueue::Backlog);
    }

    #[test]
    fn sub_issue_with_backlog_parent_is_launchable() {
        // SUP-81: Linear parent/child is hierarchy, not dependency. A sub-
        // issue whose parent sits in backlog must still be dispatchable on
        // its own merits.
        let mut i = issue("SUP-11", "started");
        i.parent_identifier = Some("SUP-10".into());

        let out = classify_launch_queue(vec![i], vec![], &default_orchestration());

        assert_eq!(out.issues[0].bucket, LaunchQueue::Launchable);
    }

    #[test]
    fn parent_with_active_superkick_run_blocks_child() {
        // Concurrency guardrail kept from SUP-80: running two Superkick
        // sessions on related issues at once tends to cause merge storms.
        let mut child = issue("SUP-11", "started");
        child.parent_identifier = Some("SUP-10".into());
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
    fn completed_issue_goes_to_done_bucket() {
        let out = classify_launch_queue(
            vec![issue("SUP-1", "completed")],
            vec![],
            &default_orchestration(),
        );
        assert_eq!(out.issues[0].bucket, LaunchQueue::Done);
    }

    #[test]
    fn cancelled_issue_goes_to_done_bucket() {
        let out = classify_launch_queue(
            vec![issue("SUP-1", "canceled")],
            vec![],
            &default_orchestration(),
        );
        assert_eq!(out.issues[0].bucket, LaunchQueue::Done);
    }

    #[test]
    fn terminal_issue_with_blockers_still_lands_in_done() {
        // Terminal state wins over blocker gate: a shipped issue belongs in
        // Done, not Blocked, even if a stale `blocks` relation remains.
        let mut i = issue("SUP-1", "completed");
        i.blockers.push(QueueIssueBlocker {
            identifier: "SUP-77".into(),
            state_type: "started".into(),
        });
        let out = classify_launch_queue(vec![i], vec![], &default_orchestration());
        assert_eq!(out.issues[0].bucket, LaunchQueue::Done);
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

        assert_eq!(out.issues[0].bucket, LaunchQueue::Waiting);
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
    fn approval_required_priority_forces_waiting() {
        let mut i = issue("SUP-1", "started");
        i.priority_value = 1; // Urgent

        let orchestration = OrchestrationInputs {
            max_concurrent_active_runs: 3,
            approval_required_priorities: &[1],
            trigger_state_type: "started",
        };

        let out = classify_launch_queue(vec![i], vec![], &orchestration);

        assert_eq!(out.issues[0].bucket, LaunchQueue::Waiting);
        assert!(out.issues[0].reason.contains("manual approval"));
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
    fn approval_reason_wins_over_capacity_reason_when_both_apply() {
        // Both rules now route to `Waiting`; precedence is observable only
        // through the `reason` string the operator reads on the card.
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

        assert_eq!(out.issues[0].bucket, LaunchQueue::Waiting);
        assert!(out.issues[0].reason.contains("manual approval"));
        assert!(!out.issues[0].reason.contains("concurrency cap"));
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
    fn linear_blocker_keeps_downstream_blocked() {
        let mut i = issue("SUP-81", "started");
        i.blockers.push(QueueIssueBlocker {
            identifier: "SUP-77".into(),
            state_type: "started".into(),
        });

        let out = classify_launch_queue(vec![i], vec![], &default_orchestration());
        assert_eq!(out.issues[0].bucket, LaunchQueue::Blocked);
        assert!(out.issues[0].reason.contains("blocked by SUP-77"));
    }

    #[test]
    fn terminal_blocker_does_not_block() {
        let mut i = issue("SUP-81", "started");
        i.blockers.push(QueueIssueBlocker {
            identifier: "SUP-77".into(),
            state_type: "completed".into(),
        });

        let out = classify_launch_queue(vec![i], vec![], &default_orchestration());
        assert_eq!(out.issues[0].bucket, LaunchQueue::Launchable);
    }

    #[test]
    fn cancelled_blocker_does_not_block() {
        let mut i = issue("SUP-81", "started");
        i.blockers.push(QueueIssueBlocker {
            identifier: "SUP-77".into(),
            state_type: "canceled".into(),
        });

        let out = classify_launch_queue(vec![i], vec![], &default_orchestration());
        assert_eq!(out.issues[0].bucket, LaunchQueue::Launchable);
    }

    #[test]
    fn mixed_blocker_states_only_non_terminal_gate_applies() {
        let mut i = issue("SUP-81", "started");
        i.blockers.push(QueueIssueBlocker {
            identifier: "SUP-77".into(),
            state_type: "completed".into(),
        });
        i.blockers.push(QueueIssueBlocker {
            identifier: "SUP-78".into(),
            state_type: "started".into(),
        });

        let out = classify_launch_queue(vec![i], vec![], &default_orchestration());
        assert_eq!(out.issues[0].bucket, LaunchQueue::Blocked);
        assert!(out.issues[0].reason.contains("SUP-78"));
        assert!(!out.issues[0].reason.contains("SUP-77"));
    }

    #[test]
    fn multiple_non_terminal_blockers_are_all_listed() {
        let mut i = issue("SUP-11", "started");
        i.parent_identifier = Some("SUP-10".into());
        i.blockers.push(QueueIssueBlocker {
            identifier: "SUP-77".into(),
            state_type: "started".into(),
        });
        i.blockers.push(QueueIssueBlocker {
            identifier: "SUP-78".into(),
            state_type: "unstarted".into(),
        });

        let out = classify_launch_queue(vec![i], vec![], &default_orchestration());
        assert_eq!(out.issues[0].bucket, LaunchQueue::Blocked);
        assert!(out.issues[0].reason.contains("SUP-77"));
        assert!(out.issues[0].reason.contains("SUP-78"));
        // Parent is not a dependency signal — its identifier must not leak
        // into the Blocked reason (SUP-81).
        assert!(!out.issues[0].reason.contains("SUP-10"));
    }

    #[test]
    fn unknown_blocker_state_still_blocks() {
        let mut i = issue("SUP-81", "started");
        i.blockers.push(QueueIssueBlocker {
            identifier: "SUP-XX".into(),
            state_type: "unknown".into(),
        });

        let out = classify_launch_queue(vec![i], vec![], &default_orchestration());
        assert_eq!(out.issues[0].bucket, LaunchQueue::Blocked);
        assert!(out.issues[0].reason.contains("unknown"));
    }

    #[test]
    fn classification_is_idempotent_for_same_inputs() {
        let make = || {
            let mut i = issue("SUP-11", "started");
            i.parent_identifier = Some("SUP-10".into());
            i.blockers.push(QueueIssueBlocker {
                identifier: "SUP-77".into(),
                state_type: "started".into(),
            });
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
