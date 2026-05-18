//! SUP-116 — domain tests for the launch task aggregate.
//!
//! Coverage:
//!   1. Task-level transitions (valid edges + rejected edges return the
//!      `InvalidLaunchTaskTransition` variant).
//!   2. Step-level transitions (same shape, distinct error variant so the
//!      API can render the right 409 message).
//!   3. `new_with_v1_recipe`: ordered sequences (1, 2, 3), correct
//!      step_kind per slot, agent name validation against the catalog,
//!      provider snapshotting from the catalog into each step.

use std::collections::HashMap;

use superkick_core::{
    AgentCatalog, AgentProvider, CoreAgentDefinition, CoreError, LaunchRecipe, LaunchStepKind,
    LaunchTask, LaunchTaskStatus, LaunchTaskStepStatus, LinearContextMode,
    PlanImplementReviewAgents, ResolvedMcpPolicy, ResolvedToolPolicy,
};

fn agent(name: &str, provider: AgentProvider, model: Option<&str>) -> CoreAgentDefinition {
    CoreAgentDefinition {
        name: name.into(),
        provider,
        role: None,
        model: model.map(String::from),
        system_prompt: None,
        tools: None,
        timeout_secs: None,
        max_turns: None,
        linear_context: LinearContextMode::default(),
        mcp_policy: ResolvedMcpPolicy::default(),
        tool_policy: ResolvedToolPolicy::default(),
        backend: None,
        runner_mode: None,
        billing_profile: None,
    }
}

fn catalog() -> AgentCatalog {
    let mut roles: HashMap<String, CoreAgentDefinition> = HashMap::new();
    roles.insert(
        "planner".into(),
        agent("planner", AgentProvider::Claude, Some("opus-4-7")),
    );
    roles.insert(
        "coder".into(),
        agent("coder", AgentProvider::Claude, Some("sonnet-4-6")),
    );
    roles.insert(
        "reviewer".into(),
        agent("reviewer", AgentProvider::Codex, None),
    );
    AgentCatalog::new(roles)
}

fn agents() -> PlanImplementReviewAgents {
    PlanImplementReviewAgents {
        planner: "planner".into(),
        coder: "coder".into(),
        reviewer: "reviewer".into(),
    }
}

// ── Task transitions ───────────────────────────────────────────────────

#[test]
fn task_pending_to_running_is_allowed() {
    let (mut task, _) =
        LaunchTask::new_with_v1_recipe("SUP-116", agents(), &catalog()).expect("task");
    assert_eq!(task.status, LaunchTaskStatus::Pending);
    task.transition_to(LaunchTaskStatus::Running).expect("ok");
    assert_eq!(task.status, LaunchTaskStatus::Running);
}

#[test]
fn task_running_to_completed_is_allowed() {
    let (mut task, _) =
        LaunchTask::new_with_v1_recipe("SUP-116", agents(), &catalog()).expect("task");
    task.transition_to(LaunchTaskStatus::Running).unwrap();
    task.transition_to(LaunchTaskStatus::Completed).unwrap();
    assert!(task.status.is_terminal());
}

#[test]
fn task_pending_to_completed_is_rejected() {
    let (mut task, _) =
        LaunchTask::new_with_v1_recipe("SUP-116", agents(), &catalog()).expect("task");
    let err = task.transition_to(LaunchTaskStatus::Completed).unwrap_err();
    assert!(matches!(
        err,
        CoreError::InvalidLaunchTaskTransition {
            from: LaunchTaskStatus::Pending,
            to: LaunchTaskStatus::Completed
        }
    ));
}

#[test]
fn task_completed_has_no_outgoing_edges() {
    assert!(LaunchTaskStatus::Completed.is_terminal());
    assert!(LaunchTaskStatus::Failed.is_terminal());
    assert!(LaunchTaskStatus::Cancelled.is_terminal());
    assert!(LaunchTaskStatus::Completed.allowed_transitions().is_empty());
    assert!(
        LaunchTaskStatus::Failed
            .transition_to(LaunchTaskStatus::Running)
            .is_err()
    );
}

#[test]
fn task_needs_human_can_resume_into_running() {
    let mut status = LaunchTaskStatus::NeedsHuman;
    status = status.transition_to(LaunchTaskStatus::Running).expect("ok");
    assert_eq!(status, LaunchTaskStatus::Running);
}

// ── SUP-120 retry validation ──────────────────────────────────────────

#[test]
fn can_retry_accepts_needs_human() {
    let (mut task, _) =
        LaunchTask::new_with_v1_recipe("SUP-120", agents(), &catalog()).expect("task");
    task.transition_to(LaunchTaskStatus::Running).unwrap();
    task.transition_to(LaunchTaskStatus::NeedsHuman).unwrap();
    task.can_retry().expect("NeedsHuman task can retry");
}

#[test]
fn can_retry_rejects_pending_with_invalid_transition() {
    let (task, _) = LaunchTask::new_with_v1_recipe("SUP-120", agents(), &catalog()).expect("task");
    let err = task.can_retry().unwrap_err();
    assert!(matches!(
        err,
        CoreError::InvalidLaunchTaskTransition {
            from: LaunchTaskStatus::Pending,
            to: LaunchTaskStatus::Running,
        }
    ));
}

#[test]
fn can_retry_rejects_running() {
    let (mut task, _) =
        LaunchTask::new_with_v1_recipe("SUP-120", agents(), &catalog()).expect("task");
    task.transition_to(LaunchTaskStatus::Running).unwrap();
    let err = task.can_retry().unwrap_err();
    assert!(matches!(
        err,
        CoreError::InvalidLaunchTaskTransition {
            from: LaunchTaskStatus::Running,
            to: LaunchTaskStatus::Running,
        }
    ));
}

#[test]
fn can_retry_rejects_terminal_states() {
    for terminal in [
        LaunchTaskStatus::Completed,
        LaunchTaskStatus::Failed,
        LaunchTaskStatus::Cancelled,
    ] {
        let (mut task, _) =
            LaunchTask::new_with_v1_recipe("SUP-120", agents(), &catalog()).expect("task");
        // Force the task into the terminal state by reaching it through valid
        // edges so `task.status` matches `terminal` for the assertion.
        match terminal {
            LaunchTaskStatus::Completed => {
                task.transition_to(LaunchTaskStatus::Running).unwrap();
                task.transition_to(LaunchTaskStatus::Completed).unwrap();
            }
            LaunchTaskStatus::Failed => {
                task.transition_to(LaunchTaskStatus::Failed).unwrap();
            }
            LaunchTaskStatus::Cancelled => {
                task.transition_to(LaunchTaskStatus::Cancelled).unwrap();
            }
            _ => unreachable!(),
        }
        let err = task.can_retry().unwrap_err();
        assert!(
            matches!(err, CoreError::InvalidLaunchTaskTransition { from, to: LaunchTaskStatus::Running } if from == terminal),
            "expected reject from {terminal:?}, got {err:?}"
        );
    }
}

// ── Step transitions ───────────────────────────────────────────────────

#[test]
fn step_pending_to_running_to_completed() {
    let (_, mut steps) =
        LaunchTask::new_with_v1_recipe("SUP-116", agents(), &catalog()).expect("task");
    let step = &mut steps[0];
    step.transition_to(LaunchTaskStepStatus::Running).unwrap();
    step.transition_to(LaunchTaskStepStatus::Completed).unwrap();
    assert!(step.status.is_terminal());
}

#[test]
fn step_pending_to_completed_is_rejected_with_step_variant() {
    let (_, mut steps) =
        LaunchTask::new_with_v1_recipe("SUP-116", agents(), &catalog()).expect("task");
    let step = &mut steps[0];
    let err = step
        .transition_to(LaunchTaskStepStatus::Completed)
        .unwrap_err();
    // Distinct variant from the task-level error: the API renders a different
    // 409 message depending on which boundary the rejection came from.
    assert!(matches!(
        err,
        CoreError::InvalidLaunchTaskStepTransition {
            from: LaunchTaskStepStatus::Pending,
            to: LaunchTaskStepStatus::Completed
        }
    ));
}

#[test]
fn step_terminal_states_have_no_outgoing_edges() {
    for s in [
        LaunchTaskStepStatus::Completed,
        LaunchTaskStepStatus::Failed,
        LaunchTaskStepStatus::Skipped,
        LaunchTaskStepStatus::Cancelled,
    ] {
        assert!(s.is_terminal(), "{s} should be terminal");
        assert!(s.allowed_transitions().is_empty(), "{s} has no edges");
    }
}

// ── Recipe construction ────────────────────────────────────────────────

#[test]
fn v1_recipe_produces_three_ordered_steps() {
    let (task, steps) =
        LaunchTask::new_with_v1_recipe("SUP-116", agents(), &catalog()).expect("task");

    assert_eq!(task.recipe_kind, LaunchRecipe::PlanImplementReview);
    assert_eq!(task.linear_issue_id, "SUP-116");
    assert_eq!(task.status, LaunchTaskStatus::Pending);
    assert!(task.current_step_id.is_none());

    assert_eq!(steps.len(), 3);
    assert_eq!(steps[0].sequence, 1);
    assert_eq!(steps[1].sequence, 2);
    assert_eq!(steps[2].sequence, 3);

    assert_eq!(steps[0].step_kind, LaunchStepKind::Plan);
    assert_eq!(steps[1].step_kind, LaunchStepKind::Implement);
    assert_eq!(steps[2].step_kind, LaunchStepKind::Review);

    // Each step shares the parent's id — the transactional insert relies on
    // this invariant to stamp the FK.
    for step in &steps {
        assert_eq!(step.launch_task_id.0, task.id.0);
        assert_eq!(step.status, LaunchTaskStepStatus::Pending);
    }
}

#[test]
fn v1_recipe_snapshots_provider_and_model_from_catalog() {
    let (_, steps) = LaunchTask::new_with_v1_recipe("SUP-116", agents(), &catalog()).expect("task");
    // Plan & implement use Claude; review uses Codex. Provider and model are
    // copied at create time so a later catalog edit cannot rewrite history.
    assert_eq!(steps[0].provider.as_deref(), Some("claude"));
    assert_eq!(steps[0].model.as_deref(), Some("opus-4-7"));
    assert_eq!(steps[1].provider.as_deref(), Some("claude"));
    assert_eq!(steps[1].model.as_deref(), Some("sonnet-4-6"));
    assert_eq!(steps[2].provider.as_deref(), Some("codex"));
    assert_eq!(steps[2].model, None);
}

#[test]
fn v1_recipe_rejects_unknown_agent_with_invalid_input() {
    let mut bad = agents();
    bad.coder = "ghost".into();
    let err = LaunchTask::new_with_v1_recipe("SUP-116", bad, &catalog()).unwrap_err();
    match err {
        CoreError::InvalidInput(msg) => assert!(msg.contains("ghost"), "unexpected: {msg}"),
        other => panic!("unexpected error variant: {other:?}"),
    }
}

#[test]
fn v1_recipe_rejects_empty_linear_issue_id() {
    let err = LaunchTask::new_with_v1_recipe("   ", agents(), &catalog()).unwrap_err();
    assert!(matches!(err, CoreError::InvalidInput(_)));
}

#[test]
fn v1_recipe_rejects_empty_agent_name() {
    let mut bad = agents();
    bad.planner = "  ".into();
    let err = LaunchTask::new_with_v1_recipe("SUP-116", bad, &catalog()).unwrap_err();
    assert!(matches!(err, CoreError::InvalidInput(_)));
}
