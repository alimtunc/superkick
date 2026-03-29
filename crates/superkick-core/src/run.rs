use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::id::RunId;
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
    /// Returns `true` if no further transitions are possible (except retry from `Failed`).
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Cancelled)
    }

    /// Returns the set of states this state may transition to.
    pub fn allowed_transitions(self) -> &'static [RunState] {
        use RunState::*;
        match self {
            Queued => &[Preparing, Cancelled],
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

/// A single run of the Superkick pipeline for one issue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Run {
    pub id: RunId,
    pub issue_id: String,
    pub issue_identifier: String,
    pub repo_slug: String,
    pub state: RunState,
    pub trigger_source: TriggerSource,
    pub current_step_key: Option<StepKey>,
    pub base_branch: String,
    pub worktree_path: Option<String>,
    pub branch_name: Option<String>,
    pub started_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
}

/// Lightweight run reference for embedding in issue detail payloads.
/// Full run detail is accessed via `GET /runs/{id}`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkedRunSummary {
    pub id: String,
    pub state: RunState,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
}

impl From<&Run> for LinkedRunSummary {
    fn from(run: &Run) -> Self {
        Self {
            id: run.id.0.to_string(),
            state: run.state,
            started_at: run.started_at,
            finished_at: run.finished_at,
        }
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
    pub fn new(
        issue_id: String,
        issue_identifier: String,
        repo_slug: String,
        trigger_source: TriggerSource,
        base_branch: String,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: RunId::new(),
            issue_id,
            issue_identifier,
            repo_slug,
            state: RunState::Queued,
            trigger_source,
            current_step_key: None,
            base_branch,
            worktree_path: None,
            branch_name: None,
            started_at: now,
            updated_at: now,
            finished_at: None,
            error_message: None,
        }
    }

    /// Transition the run to a new state.
    pub fn transition_to(&mut self, target: RunState) -> Result<(), CoreError> {
        self.state = self.state.transition_to(target)?;
        self.updated_at = Utc::now();
        if target.is_terminal() || target == RunState::Failed {
            self.finished_at = Some(Utc::now());
        }
        Ok(())
    }
}
