//! Launch task aggregate — SUP-116.
//!
//! A `LaunchTask` is one autonomous attempt to push a Linear issue forward
//! through a multi-agent recipe. It owns the parent state, an ordered list of
//! steps (one per agent role), and the validated transitions that gate
//! progress. The execution loop (SUP-118), the launcher UI (SUP-117) and the
//! Claude sub-agent backend (SUP-121) all consume this aggregate.
//!
//! V1 ships the integrated recipe `Plan → Implement → Review`. Keeping the
//! recipe enum behind a single `new_with_v1_recipe` constructor lets a future
//! ticket add new variants without changing the call sites that already exist.
//!
//! Status semantics intentionally diverge from `OrchestratorStatus` — a
//! launch task is sequential and one-shot, not a meta-conversation. Sharing
//! the enum would let `Thinking`/`Dispatching` slip into a launch row where
//! they don't belong.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::id::{ConversationId, LaunchTaskId, LaunchTaskStepId, OrchestratorSessionId, RunId};
use crate::role_router::AgentCatalog;

/// Recipe identifier. Stored as a string column so adding a new recipe later
/// does not need a SQL migration. V1 only ships `PlanImplementReview`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LaunchRecipe {
    PlanImplementReview,
}

impl std::fmt::Display for LaunchRecipe {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::PlanImplementReview => "plan_implement_review",
        };
        f.write_str(s)
    }
}

/// Lifecycle of the parent launch task.
///
/// Design rationale (asymmetries):
///
/// - **`Completed` / `Failed` / `Cancelled` are terminal** — no outgoing
///   edges. The execution loop must spawn a fresh task to retry.
/// - **`NeedsHuman` is reachable from `Running` only** — the operator-facing
///   blocker is always tied to an in-flight step, never to a pending one.
/// - **`Pending` cannot jump straight to `Completed`** — every recipe runs at
///   least one step, so a "completed without running" state would mask a
///   bug in the loop rather than reflect a legitimate transition.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LaunchTaskStatus {
    Pending,
    Running,
    NeedsHuman,
    Completed,
    Failed,
    Cancelled,
}

impl LaunchTaskStatus {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }

    pub fn allowed_transitions(self) -> &'static [LaunchTaskStatus] {
        use LaunchTaskStatus::*;
        match self {
            Pending => &[Running, Cancelled, Failed],
            Running => &[NeedsHuman, Completed, Failed, Cancelled],
            NeedsHuman => &[Running, Cancelled, Failed],
            Completed | Failed | Cancelled => &[],
        }
    }

    pub fn can_transition_to(self, target: LaunchTaskStatus) -> bool {
        self.allowed_transitions().contains(&target)
    }

    pub fn transition_to(self, target: LaunchTaskStatus) -> Result<LaunchTaskStatus, CoreError> {
        if self.can_transition_to(target) {
            Ok(target)
        } else {
            Err(CoreError::InvalidLaunchTaskTransition {
                from: self,
                to: target,
            })
        }
    }
}

impl std::fmt::Display for LaunchTaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::NeedsHuman => "needs_human",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        };
        f.write_str(s)
    }
}

/// Per-step lifecycle. Wider than the parent: a step can be `Skipped` (a
/// future recipe might allow a noop branch) and steps can fail individually
/// without dragging the parent into `Failed` until the loop decides to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LaunchTaskStepStatus {
    Pending,
    Running,
    Completed,
    Failed,
    NeedsHuman,
    Skipped,
    Cancelled,
}

impl LaunchTaskStepStatus {
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Skipped | Self::Cancelled
        )
    }

    pub fn allowed_transitions(self) -> &'static [LaunchTaskStepStatus] {
        use LaunchTaskStepStatus::*;
        match self {
            Pending => &[Running, Skipped, Cancelled, Failed],
            Running => &[Completed, Failed, NeedsHuman, Cancelled],
            NeedsHuman => &[Running, Cancelled, Failed],
            Completed | Failed | Skipped | Cancelled => &[],
        }
    }

    pub fn can_transition_to(self, target: LaunchTaskStepStatus) -> bool {
        self.allowed_transitions().contains(&target)
    }

    pub fn transition_to(
        self,
        target: LaunchTaskStepStatus,
    ) -> Result<LaunchTaskStepStatus, CoreError> {
        if self.can_transition_to(target) {
            Ok(target)
        } else {
            Err(CoreError::InvalidLaunchTaskStepTransition {
                from: self,
                to: target,
            })
        }
    }
}

impl std::fmt::Display for LaunchTaskStepStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::NeedsHuman => "needs_human",
            Self::Skipped => "skipped",
            Self::Cancelled => "cancelled",
        };
        f.write_str(s)
    }
}

/// Step kind — what the step is *doing* in the recipe. Independent of which
/// agent runs it: SUP-121 may add a `repo_planner` agent that still maps to
/// `Plan` here.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LaunchStepKind {
    Plan,
    Implement,
    Review,
}

impl std::fmt::Display for LaunchStepKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Plan => "plan",
            Self::Implement => "implement",
            Self::Review => "review",
        };
        f.write_str(s)
    }
}

/// Agent assignments for the `PlanImplementReview` recipe. Names are looked
/// up in the project agent catalog at task creation; the resolved
/// `provider`/`model` are *snapshotted* into each step so a later catalog
/// edit does not retroactively rewrite the trace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlanImplementReviewAgents {
    pub planner: String,
    pub coder: String,
    pub reviewer: String,
}

/// One ordered step inside a `LaunchTask`.
///
/// `agent_name` is a free-form catalog reference (no FK, by design — see
/// SUP-121's plan to add user/repo agents that may not live in SQL). The
/// `provider`/`model`/`mode` columns are the snapshot taken at creation and
/// remain immutable; the runtime can still record progress via `status` and
/// the link columns.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchTaskStep {
    pub id: LaunchTaskStepId,
    pub launch_task_id: LaunchTaskId,
    pub sequence: u32,
    pub step_kind: LaunchStepKind,
    pub agent_name: String,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub mode: Option<String>,
    pub status: LaunchTaskStepStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub linked_run_id: Option<RunId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub linked_conversation_id: Option<ConversationId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub linked_orchestrator_session_id: Option<OrchestratorSessionId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl LaunchTaskStep {
    /// Apply a status transition, bumping `updated_at`.
    pub fn transition_to(&mut self, target: LaunchTaskStepStatus) -> Result<(), CoreError> {
        self.status = self.status.transition_to(target)?;
        self.updated_at = Utc::now();
        Ok(())
    }

    /// Append-only link assignment: each `Some` overwrites the matching
    /// column, each `None` leaves the existing value alone. The asymmetry
    /// (no way to clear a link) is intentional — the runtime only ever
    /// *adds* a link as a step progresses, and "forget the link" has never
    /// been a real use case. If we ever need clear-semantics, model
    /// `LinkPatch { Keep, Set(T), Clear }` rather than smuggling it through
    /// `Option<Option<T>>`.
    pub fn add_links(
        &mut self,
        run_id: Option<RunId>,
        conversation_id: Option<ConversationId>,
        orchestrator_session_id: Option<OrchestratorSessionId>,
    ) {
        if let Some(run_id) = run_id {
            self.linked_run_id = Some(run_id);
        }
        if let Some(conversation_id) = conversation_id {
            self.linked_conversation_id = Some(conversation_id);
        }
        if let Some(orchestrator_session_id) = orchestrator_session_id {
            self.linked_orchestrator_session_id = Some(orchestrator_session_id);
        }
        self.updated_at = Utc::now();
    }
}

/// The launch-task aggregate. Persisted alongside its ordered steps (see
/// `SqliteLaunchTaskRepo::insert_with_steps`). `current_step_id` is a
/// denormalised pointer maintained by the execution loop — without a SQL FK,
/// since a freshly-inserted task has no current step yet (chicken-and-egg
/// with the step table).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchTask {
    pub id: LaunchTaskId,
    pub linear_issue_id: String,
    pub recipe_kind: LaunchRecipe,
    pub status: LaunchTaskStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_step_id: Option<LaunchTaskStepId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl LaunchTask {
    /// Build a `Plan → Implement → Review` task with three pending steps.
    /// Each agent name is resolved against the catalog so a typo or missing
    /// role fails fast with `CoreError::InvalidInput` instead of leaving a
    /// half-written task in the DB.
    pub fn new_with_v1_recipe(
        linear_issue_id: impl Into<String>,
        agents: PlanImplementReviewAgents,
        catalog: &AgentCatalog,
    ) -> Result<(Self, Vec<LaunchTaskStep>), CoreError> {
        let linear_issue_id = linear_issue_id.into();
        if linear_issue_id.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "launch task linear_issue_id must not be empty".into(),
            ));
        }

        let now = Utc::now();
        let task_id = LaunchTaskId::new();

        let plan_step = build_step(
            task_id,
            1,
            LaunchStepKind::Plan,
            &agents.planner,
            catalog,
            now,
        )?;
        let implement_step = build_step(
            task_id,
            2,
            LaunchStepKind::Implement,
            &agents.coder,
            catalog,
            now,
        )?;
        let review_step = build_step(
            task_id,
            3,
            LaunchStepKind::Review,
            &agents.reviewer,
            catalog,
            now,
        )?;

        let task = LaunchTask {
            id: task_id,
            linear_issue_id,
            recipe_kind: LaunchRecipe::PlanImplementReview,
            status: LaunchTaskStatus::Pending,
            current_step_id: None,
            summary: None,
            created_at: now,
            updated_at: now,
        };

        Ok((task, vec![plan_step, implement_step, review_step]))
    }

    /// Apply a status transition, bumping `updated_at`.
    pub fn transition_to(&mut self, target: LaunchTaskStatus) -> Result<(), CoreError> {
        self.status = self.status.transition_to(target)?;
        self.updated_at = Utc::now();
        Ok(())
    }

    /// Move the denormalised pointer to the step the execution loop is
    /// currently driving. `None` clears it (used when the task transitions
    /// to a terminal state).
    pub fn set_current_step(&mut self, step_id: Option<LaunchTaskStepId>) {
        self.current_step_id = step_id;
        self.updated_at = Utc::now();
    }

    /// SUP-120 — retry of a `NeedsHuman` task is only allowed from
    /// `NeedsHuman`. The runtime calls this before issuing any writes so
    /// that the API surfaces a 409 with the same `InvalidLaunchTaskTransition`
    /// shape the rest of the state machine uses.
    pub fn can_retry(&self) -> Result<(), CoreError> {
        if matches!(self.status, LaunchTaskStatus::NeedsHuman) {
            Ok(())
        } else {
            Err(CoreError::InvalidLaunchTaskTransition {
                from: self.status,
                to: LaunchTaskStatus::Running,
            })
        }
    }
}

fn build_step(
    task_id: LaunchTaskId,
    sequence: u32,
    kind: LaunchStepKind,
    agent_name: &str,
    catalog: &AgentCatalog,
    now: DateTime<Utc>,
) -> Result<LaunchTaskStep, CoreError> {
    if agent_name.trim().is_empty() {
        return Err(CoreError::InvalidInput(format!(
            "launch task {kind} step agent name must not be empty"
        )));
    }
    let def = catalog.get(agent_name).ok_or_else(|| {
        CoreError::InvalidInput(format!(
            "agent '{agent_name}' is not defined in the project catalog"
        ))
    })?;
    Ok(LaunchTaskStep {
        id: LaunchTaskStepId::new(),
        launch_task_id: task_id,
        sequence,
        step_kind: kind,
        agent_name: def.name.clone(),
        provider: Some(def.provider.to_string()),
        model: def.model.clone(),
        mode: None,
        status: LaunchTaskStepStatus::Pending,
        linked_run_id: None,
        linked_conversation_id: None,
        linked_orchestrator_session_id: None,
        summary: None,
        created_at: now,
        updated_at: now,
    })
}
