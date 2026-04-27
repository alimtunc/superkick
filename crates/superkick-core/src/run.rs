use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::id::RunId;
use crate::pull_request::LinkedPrSummary;
use crate::step::StepKey;

/// Every run moves through explicit states. Terminal states are `Completed`,
/// `Failed`, and `Cancelled`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunState {
    Queued,
    Preparing,
    Planning,
    Coding,
    RunningCommands,
    Reviewing,
    WaitingHuman,
    OpeningPr,
    Completed,
    Failed,
    Cancelled,
}

impl RunState {
    /// Returns `true` when the run has reached a final outcome.
    /// `Failed` is terminal but allows a retry transition back to `Queued`.
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }

    /// Returns the set of states this state may transition to.
    pub fn allowed_transitions(self) -> &'static [RunState] {
        use RunState::*;
        match self {
            // `Queued → WaitingHuman` lets `pre_step_gate` pause a fresh run
            // before its first step (e.g. approval checkpoint on `Prepare`, or
            // a duration tripwire that fires the moment the run is queued).
            Queued => &[Preparing, WaitingHuman, Cancelled],
            Preparing => &[Planning, WaitingHuman, Failed, Cancelled],
            Planning => &[Coding, WaitingHuman, Failed, Cancelled],
            Coding => &[RunningCommands, WaitingHuman, Failed, Cancelled],
            RunningCommands => &[Reviewing, Coding, WaitingHuman, Failed, Cancelled],
            Reviewing => &[OpeningPr, Coding, WaitingHuman, Failed, Cancelled],
            WaitingHuman => &[
                Preparing,
                Planning,
                Coding,
                RunningCommands,
                Reviewing,
                OpeningPr,
                Failed,
                Cancelled,
            ],
            OpeningPr => &[Completed, WaitingHuman, Failed, Cancelled],
            Failed => &[Queued],
            Completed | Cancelled => &[],
        }
    }

    /// Check whether transitioning to `target` is valid.
    pub fn can_transition_to(self, target: RunState) -> bool {
        self.allowed_transitions().contains(&target)
    }

    /// Attempt to transition, returning the new state or an error.
    pub fn transition_to(self, target: RunState) -> Result<RunState, CoreError> {
        if self.can_transition_to(target) {
            Ok(target)
        } else {
            Err(CoreError::InvalidTransition {
                from: self,
                to: target,
            })
        }
    }
}

impl std::fmt::Display for RunState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Queued => "queued",
            Self::Preparing => "preparing",
            Self::Planning => "planning",
            Self::Coding => "coding",
            Self::RunningCommands => "running_commands",
            Self::Reviewing => "reviewing",
            Self::WaitingHuman => "waiting_human",
            Self::OpeningPr => "opening_pr",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        };
        f.write_str(s)
    }
}

/// How a run was triggered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TriggerSource {
    LinearWebhook,
    Manual,
    Retry,
}

/// How much autonomy a run has during execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionMode {
    /// Run proceeds autonomously. Interrupts only on failure (per policy).
    #[default]
    FullAuto,
    /// Run pauses after planning for operator review before coding starts.
    /// Designed for live supervision workflows.
    SemiAuto,
}

impl std::fmt::Display for ExecutionMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::FullAuto => f.write_str("full_auto"),
            Self::SemiAuto => f.write_str("semi_auto"),
        }
    }
}

/// Per-run execution contract. Any dimension set to `None` is not enforced.
///
/// The budget is copied from project config at launch time and then persisted
/// against the run so a config change mid-flight cannot retroactively widen or
/// tighten an in-flight run. The supervisor checks each dimension before every
/// step and transitions to `WaitingHuman` when one trips.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunBudget {
    /// Hard wall-clock ceiling in seconds from `started_at` to step entry.
    pub duration_secs: Option<u64>,
    /// Sum of `(attempt - 1)` across every run step. Caps cumulative retry
    /// cost, orthogonal to the per-step `max_retries_per_step` policy.
    pub retries_max: Option<u32>,
    /// Aggregate token ceiling across every session in the run.
    /// When no integration reports tokens, this dimension is skipped rather
    /// than tripped (see SUP-72 plan, risk 1).
    pub token_ceiling: Option<u64>,
}

/// Snapshot of observed budget usage at the moment of an operator override.
///
/// Without this baseline, every subsequent `pre_step_gate` would re-evaluate
/// the same observed counters against the same limits and trip again on the
/// next step — pause → override → run one step → pause → override forever.
/// The evaluator subtracts these offsets from the live observed values, so an
/// override grants a fresh full budget cycle from "now" for each dimension.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunBudgetGrant {
    /// Seconds of duration that were already consumed when the operator
    /// overrode the trip — subtracted from `now - started_at` on next check.
    #[serde(default)]
    pub duration_secs: u64,
    /// Cumulative retry count at override time.
    #[serde(default)]
    pub retries: u32,
    /// Aggregate token usage at override time.
    #[serde(default)]
    pub tokens: u64,
}

/// Structured reason a run is paused. `None` means "not paused", even when
/// `RunState::WaitingHuman` because of an unrelated reason (e.g. step failure).
///
/// We keep `WaitingHuman` as the only "paused" state and discriminate the
/// *cause* via this enum + `pause_reason` — avoids fragmenting the state
/// machine while still letting the UI render distinct affordances.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PauseKind {
    #[default]
    None,
    Budget,
    Approval,
}

impl std::fmt::Display for PauseKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::None => f.write_str("none"),
            Self::Budget => f.write_str("budget"),
            Self::Approval => f.write_str("approval"),
        }
    }
}

/// A single run of the Superkick pipeline for one issue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Run {
    pub id: RunId,
    pub issue_id: String,
    pub issue_identifier: String,
    pub repo_slug: String,
    pub state: RunState,
    pub trigger_source: TriggerSource,
    pub execution_mode: ExecutionMode,
    pub current_step_key: Option<StepKey>,
    pub base_branch: String,
    pub use_worktree: bool,
    pub worktree_path: Option<String>,
    pub branch_name: Option<String>,
    pub operator_instructions: Option<String>,
    pub started_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    /// Execution contract snapshotted at launch. Enforced pre-step by the supervisor.
    #[serde(default)]
    pub budget: RunBudget,
    /// Cumulative offsets applied by operator overrides — subtracted from
    /// observed values so a budget trip + override grants a fresh budget cycle
    /// rather than re-tripping immediately on the next step.
    #[serde(default)]
    pub budget_grant: RunBudgetGrant,
    /// Discriminator for *why* the run is paused — see `pause_reason` for the
    /// human-readable detail.
    #[serde(default)]
    pub pause_kind: PauseKind,
    /// Free-form reason rendered to the operator when the run is paused.
    #[serde(default)]
    pub pause_reason: Option<String>,
}

/// Lightweight run reference for embedding in issue detail payloads.
/// Full run detail is accessed via `GET /runs/{id}`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedRunSummary {
    pub id: String,
    pub state: RunState,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    /// Linked GitHub PR summary, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pr: Option<LinkedPrSummary>,
}

impl From<&Run> for LinkedRunSummary {
    fn from(run: &Run) -> Self {
        Self {
            id: run.id.0.to_string(),
            state: run.state,
            started_at: run.started_at,
            finished_at: run.finished_at,
            pr: None,
        }
    }
}

impl LinkedRunSummary {
    /// Attach a PR summary discovered from the pull_requests table.
    #[must_use]
    pub fn with_pr(mut self, pr: Option<LinkedPrSummary>) -> Self {
        self.pr = pr;
        self
    }
}

impl Run {
    /// Returns `Err(CoreError::DuplicateActiveRun)` if `existing` is an active
    /// (non-terminal) run for the same issue. Call before `Run::new`.
    pub fn guard_no_active(
        existing: Option<&Run>,
        issue_identifier: &str,
    ) -> Result<(), CoreError> {
        if let Some(active) = existing {
            return Err(CoreError::DuplicateActiveRun {
                issue_identifier: issue_identifier.to_string(),
                active_run_id: active.id,
                state: active.state,
            });
        }
        Ok(())
    }

    /// Create a new run in the `Queued` state.
    ///
    /// The budget defaults to an empty `RunBudget` (no enforcement). Chain
    /// `.with_budget(...)` at launch time to snapshot the project budget into
    /// the run — keeping `Run::new` backwards-compatible with test helpers.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        issue_id: String,
        issue_identifier: String,
        repo_slug: String,
        trigger_source: TriggerSource,
        execution_mode: ExecutionMode,
        base_branch: String,
        use_worktree: bool,
        operator_instructions: Option<String>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: RunId::new(),
            issue_id,
            issue_identifier,
            repo_slug,
            state: RunState::Queued,
            trigger_source,
            execution_mode,
            current_step_key: None,
            base_branch,
            use_worktree,
            worktree_path: None,
            branch_name: None,
            operator_instructions,
            started_at: now,
            updated_at: now,
            finished_at: None,
            error_message: None,
            budget: RunBudget::default(),
            budget_grant: RunBudgetGrant::default(),
            pause_kind: PauseKind::None,
            pause_reason: None,
        }
    }

    /// Attach a budget contract to a freshly created run. Typically called
    /// with `config.budget.run_budget_snapshot()` at launch time.
    #[must_use]
    pub fn with_budget(mut self, budget: RunBudget) -> Self {
        self.budget = budget;
        self
    }

    /// Transition the run to a new state.
    pub fn transition_to(&mut self, target: RunState) -> Result<(), CoreError> {
        self.state = self.state.transition_to(target)?;
        let now = Utc::now();
        self.updated_at = now;
        if target.is_terminal() {
            self.finished_at = Some(now);
        }
        Ok(())
    }

    /// Mark the run as paused with a structured reason. Caller is responsible
    /// for persisting and emitting the corresponding event — this only mutates
    /// the in-memory pause fields.
    pub fn mark_paused(&mut self, kind: PauseKind, reason: impl Into<String>) {
        self.pause_kind = kind;
        self.pause_reason = Some(reason.into());
    }

    /// Clear the pause metadata. Call after the operator has resolved the
    /// gate (approve / override / reject).
    pub fn clear_pause(&mut self) {
        self.pause_kind = PauseKind::None;
        self.pause_reason = None;
    }

    /// Append a labelled note to `operator_instructions`. The note is rendered
    /// to the agent under a section header (e.g. "budget override",
    /// "semi-auto checkpoint") so multiple checkpoints in one run remain
    /// distinguishable. No-op when `note` is empty.
    pub fn append_operator_note(&mut self, header: &str, note: &str) {
        if note.is_empty() {
            return;
        }
        let existing = self.operator_instructions.take().unwrap_or_default();
        let combined = if existing.is_empty() {
            note.to_string()
        } else {
            format!("{existing}\n\n--- Operator note ({header}) ---\n{note}")
        };
        self.operator_instructions = Some(combined);
    }
}
