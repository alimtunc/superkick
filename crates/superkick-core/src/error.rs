use crate::handoff::HandoffStatus;
use crate::id::RunId;
use crate::launch_task::{LaunchTaskStatus, LaunchTaskStepStatus};
use crate::orchestrator_session::OrchestratorStatus;
use crate::run::RunState;

/// Core domain errors for Superkick.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("invalid state transition: {from} -> {to}")]
    InvalidTransition { from: RunState, to: RunState },

    /// Orchestrator-session state machine refused a transition. Carried as a
    /// distinct variant so the API layer can map it to 409 Conflict in one
    /// place — versus 400 for shape errors (`InvalidInput`).
    #[error("invalid orchestrator session transition: {from} -> {to}")]
    InvalidOrchestratorTransition {
        from: OrchestratorStatus,
        to: OrchestratorStatus,
    },

    /// Launch-task aggregate refused a status transition. Same 409 mapping
    /// rationale as `InvalidOrchestratorTransition` — kept as its own variant
    /// so the API layer's error message can name the aggregate.
    #[error("invalid launch task transition: {from} -> {to}")]
    InvalidLaunchTaskTransition {
        from: LaunchTaskStatus,
        to: LaunchTaskStatus,
    },

    /// Launch-task step refused a status transition. Distinct from the
    /// aggregate transition so the operator can tell whether the rejection
    /// came from the parent or a single step.
    #[error("invalid launch task step transition: {from} -> {to}")]
    InvalidLaunchTaskStepTransition {
        from: LaunchTaskStepStatus,
        to: LaunchTaskStepStatus,
    },

    /// Handoff state machine refused a transition. Same 409 mapping rationale
    /// as `InvalidOrchestratorTransition` — its own variant so the API layer's
    /// error message can name the handoff aggregate, versus 400 for shape
    /// errors (`InvalidInput`).
    #[error("invalid handoff transition: {from} -> {to}")]
    InvalidHandoffTransition {
        from: HandoffStatus,
        to: HandoffStatus,
    },

    #[error("run is in terminal state: {0}")]
    TerminalState(RunState),

    #[error("issue {issue_identifier} already has an active run ({state})")]
    DuplicateActiveRun {
        issue_identifier: String,
        active_run_id: RunId,
        state: RunState,
    },

    #[error("invalid input: {0}")]
    InvalidInput(String),

    /// SUP-148 — memory entry rejected because its text matched a credential
    /// pattern. Carried as a distinct variant so the API layer can map it to
    /// 422 Unprocessable in one place; `kind` names the matching pattern
    /// (`bearer_token`, `aws_access_key`, …) so the operator can see which
    /// guard tripped without leaking the secret itself.
    #[error("redacted credential-like content matched pattern: {kind}")]
    CredentialLikely { kind: &'static str },

    #[error("failed to serialize interrupt answer: {0}")]
    InterruptAnswerSerialization(#[from] serde_json::Error),
}
