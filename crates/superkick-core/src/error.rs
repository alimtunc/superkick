use crate::run::RunState;

/// Core domain errors for Superkick.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("invalid state transition: {from} -> {to}")]
    InvalidTransition { from: RunState, to: RunState },

    #[error("run is in terminal state: {0}")]
    TerminalState(RunState),
}
