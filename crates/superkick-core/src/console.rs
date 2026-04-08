use crate::error::CoreError;
use crate::event::{EventKind, EventLevel, RunEvent};
use crate::run::{ExecutionMode, Run};

/// Validate preconditions, mutate the run with the new operator input, and
/// build the corresponding event.
///
/// Returns the event to persist. The caller must persist both `run` and the event.
pub fn accept_operator_input(run: &mut Run, message: &str) -> Result<RunEvent, CoreError> {
    if run.state.is_terminal() {
        return Err(CoreError::TerminalState(run.state));
    }

    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err(CoreError::InvalidInput(
            "operator message must not be empty".into(),
        ));
    }

    let label = match run.execution_mode {
        ExecutionMode::FullAuto => "Operator injection (full-auto)",
        ExecutionMode::SemiAuto => "Operator note (semi-auto)",
    };

    let updated_instructions = match run.operator_instructions.as_deref() {
        Some(existing) if !existing.is_empty() => {
            format!("{existing}\n\n--- {label} ---\n{trimmed}")
        }
        _ => trimmed.to_string(),
    };

    run.operator_instructions = Some(updated_instructions);
    run.updated_at = chrono::Utc::now();

    let event = RunEvent::new(
        run.id,
        None,
        EventKind::OperatorInput,
        EventLevel::Info,
        format!("[operator] {trimmed}"),
    );

    Ok(event)
}
