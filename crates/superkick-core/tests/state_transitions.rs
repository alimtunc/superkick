use superkick_core::{CoreError, Run, RunState, TriggerSource};

/// Helper: create a run in the given state.
fn run_in(state: RunState) -> Run {
    let mut run = Run::new(
        "issue-1".into(),
        "SK-1".into(),
        "owner/repo".into(),
        TriggerSource::Manual,
        "main".into(),
    );
    // Force to desired state for testing.
    run.state = state;
    run
}

// ── Happy-path transitions ───────────────────────────────────────────

#[test]
fn queued_to_preparing() {
    let mut run = run_in(RunState::Queued);
    assert!(run.transition_to(RunState::Preparing).is_ok());
    assert_eq!(run.state, RunState::Preparing);
}

#[test]
fn preparing_to_planning() {
    assert!(RunState::Preparing.can_transition_to(RunState::Planning));
}

#[test]
fn planning_to_coding() {
    assert!(RunState::Planning.can_transition_to(RunState::Coding));
}

#[test]
fn coding_to_running_commands() {
    assert!(RunState::Coding.can_transition_to(RunState::RunningCommands));
}

#[test]
fn running_commands_to_reviewing() {
    assert!(RunState::RunningCommands.can_transition_to(RunState::Reviewing));
}

#[test]
fn reviewing_to_opening_pr() {
    assert!(RunState::Reviewing.can_transition_to(RunState::OpeningPr));
}

#[test]
fn opening_pr_to_completed() {
    let mut run = run_in(RunState::OpeningPr);
    assert!(run.transition_to(RunState::Completed).is_ok());
    assert_eq!(run.state, RunState::Completed);
    assert!(run.finished_at.is_some());
}

#[test]
fn full_happy_path() {
    let mut run = run_in(RunState::Queued);
    let path = [
        RunState::Preparing,
        RunState::Planning,
        RunState::Coding,
        RunState::RunningCommands,
        RunState::Reviewing,
        RunState::OpeningPr,
        RunState::Completed,
    ];
    for target in path {
        run.transition_to(target).unwrap();
    }
    assert_eq!(run.state, RunState::Completed);
}

// ── Failure and cancellation ─────────────────────────────────────────

#[test]
fn any_active_state_can_fail() {
    let active = [
        RunState::Preparing,
        RunState::Planning,
        RunState::Coding,
        RunState::RunningCommands,
        RunState::Reviewing,
        RunState::OpeningPr,
    ];
    for s in active {
        assert!(s.can_transition_to(RunState::Failed), "{s} should be able to fail");
    }
}

#[test]
fn any_active_state_can_cancel() {
    let active = [
        RunState::Queued,
        RunState::Preparing,
        RunState::Planning,
        RunState::Coding,
        RunState::RunningCommands,
        RunState::Reviewing,
        RunState::OpeningPr,
    ];
    for s in active {
        assert!(
            s.can_transition_to(RunState::Cancelled),
            "{s} should be cancellable"
        );
    }
}

#[test]
fn failed_can_retry_to_queued() {
    assert!(RunState::Failed.can_transition_to(RunState::Queued));
}

#[test]
fn failed_sets_finished_at() {
    let mut run = run_in(RunState::Preparing);
    run.transition_to(RunState::Failed).unwrap();
    assert!(run.finished_at.is_some());
}

// ── Terminal states ──────────────────────────────────────────────────

#[test]
fn completed_is_terminal() {
    assert!(RunState::Completed.is_terminal());
    assert!(RunState::Completed.allowed_transitions().is_empty());
}

#[test]
fn cancelled_is_terminal() {
    assert!(RunState::Cancelled.is_terminal());
    assert!(RunState::Cancelled.allowed_transitions().is_empty());
}

#[test]
fn completed_cannot_transition() {
    let mut run = run_in(RunState::Completed);
    let result = run.transition_to(RunState::Queued);
    assert!(result.is_err());
    assert!(matches!(
        result.unwrap_err(),
        CoreError::InvalidTransition { .. }
    ));
}

#[test]
fn cancelled_cannot_transition() {
    let result = RunState::Cancelled.transition_to(RunState::Queued);
    assert!(result.is_err());
}

// ── Interrupt (waiting_human) ────────────────────────────────────────

#[test]
fn active_states_can_enter_waiting_human() {
    let states = [
        RunState::Planning,
        RunState::Coding,
        RunState::RunningCommands,
        RunState::Reviewing,
    ];
    for s in states {
        assert!(
            s.can_transition_to(RunState::WaitingHuman),
            "{s} should be able to wait for human"
        );
    }
}

#[test]
fn waiting_human_can_resume_to_active_states() {
    let resume_targets = [
        RunState::Preparing,
        RunState::Planning,
        RunState::Coding,
        RunState::RunningCommands,
        RunState::Reviewing,
        RunState::OpeningPr,
    ];
    for t in resume_targets {
        assert!(
            RunState::WaitingHuman.can_transition_to(t),
            "waiting_human should be able to resume to {t}"
        );
    }
}

#[test]
fn waiting_human_can_fail_or_cancel() {
    assert!(RunState::WaitingHuman.can_transition_to(RunState::Failed));
    assert!(RunState::WaitingHuman.can_transition_to(RunState::Cancelled));
}

// ── Invalid transitions ──────────────────────────────────────────────

#[test]
fn queued_cannot_skip_to_coding() {
    assert!(!RunState::Queued.can_transition_to(RunState::Coding));
}

#[test]
fn queued_cannot_go_to_completed() {
    assert!(!RunState::Queued.can_transition_to(RunState::Completed));
}

#[test]
fn preparing_cannot_go_to_completed() {
    assert!(!RunState::Preparing.can_transition_to(RunState::Completed));
}

#[test]
fn coding_cannot_skip_to_opening_pr() {
    assert!(!RunState::Coding.can_transition_to(RunState::OpeningPr));
}

#[test]
fn failed_cannot_go_to_completed() {
    assert!(!RunState::Failed.can_transition_to(RunState::Completed));
}

// ── Loopback transitions ────────────────────────────────────────────

#[test]
fn running_commands_can_loop_back_to_coding() {
    assert!(RunState::RunningCommands.can_transition_to(RunState::Coding));
}

#[test]
fn reviewing_can_loop_back_to_coding() {
    assert!(RunState::Reviewing.can_transition_to(RunState::Coding));
}
