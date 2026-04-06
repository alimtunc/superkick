use crate::id::RunId;
use crate::run::RunState;

/// Core domain errors for Superkick.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("invalid state transition: {from} -> {to}")]
    InvalidTransition { from: RunState, to: RunState },

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

    #[error("failed to serialize interrupt answer: {0}")]
    InterruptAnswerSerialization(#[from] serde_json::Error),
}
