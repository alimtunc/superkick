//! SUP-124 — contract tests for the storage edges `RealStepRunner` writes.
//!
//! The full happy path (3 × `AgentSupervisor::launch` consécutifs with a
//! fake agent process) requires trait-ifying `AgentSupervisor` to inject a
//! fake — out of scope for SUP-124 and tracked as a follow-up. These tests
//! pin the pieces that the runner *does* depend on through the public
//! repository APIs:
//!
//! 1. `TriggerSource::LaunchTask` round-trips through SQLite so the shadow
//!    Run the runner inserts is recoverable on the dashboard.
//! 2. `LaunchTaskRepo::set_step_summary` is durable, with `add_step_links`
//!    composing alongside it.
//! 3. Driving `LaunchTaskExecutor` with a scripted runner that returns
//!    `StepOutcome::Completed { summary }` persists the summary on the
//!    step row — the link that SUP-118 published only on the bus.
//!
//! Tests use in-memory SQLite per CLAUDE.md rule 9.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::Result;
use tokio_util::sync::CancellationToken;

use superkick_core::{
    AgentCatalog, AgentProvider, CoreAgentDefinition, ExecutionMode, LaunchStepKind,
    LaunchTaskStepStatus, LinearContextMode, PlanImplementReviewAgents, ResolvedMcpPolicy,
    ResolvedToolPolicy, Run, RunId, RunState, RunStep, StepKey, StepStatus, TriggerSource,
};
use superkick_runtime::{
    LaunchTaskEventBus, LaunchTaskExecutor, LaunchTaskRegistry, StepLinks, StepOutcome, StepRunner,
};
use superkick_storage::repo::{LaunchTaskRepo, RunRepo, RunStepRepo};
use superkick_storage::{SqliteLaunchTaskRepo, SqliteRunRepo, SqliteRunStepRepo, connect};

// ── Fixture ───────────────────────────────────────────────────────────

fn agent(name: &str, provider: AgentProvider) -> CoreAgentDefinition {
    CoreAgentDefinition {
        name: name.into(),
        provider,
        role: None,
        model: None,
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
    roles.insert("planner".into(), agent("planner", AgentProvider::Claude));
    roles.insert("coder".into(), agent("coder", AgentProvider::Claude));
    roles.insert("reviewer".into(), agent("reviewer", AgentProvider::Codex));
    AgentCatalog::new(roles)
}

fn agents() -> PlanImplementReviewAgents {
    PlanImplementReviewAgents {
        planner: "planner".into(),
        coder: "coder".into(),
        reviewer: "reviewer".into(),
    }
}

// ── 1. TriggerSource::LaunchTask round-trip ───────────────────────────

#[tokio::test]
async fn shadow_run_with_launch_task_trigger_source_round_trips() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let run_repo = SqliteRunRepo::new(pool.clone());
    let step_repo = SqliteRunStepRepo::new(pool);

    let run = Run::new(
        "TEAM-1".into(),
        "TEAM-1".into(),
        "owner/repo".into(),
        TriggerSource::LaunchTask,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    let run_id = run.id;
    run_repo.insert(&run).await?;

    let mut step = RunStep::new(run_id, StepKey::Plan, 1);
    step.status = StepStatus::Running;
    step_repo.insert(&step).await?;

    let reloaded = run_repo
        .get(run_id)
        .await?
        .expect("shadow run must persist");
    assert_eq!(reloaded.trigger_source, TriggerSource::LaunchTask);
    assert_eq!(reloaded.state, RunState::Queued);

    let steps = step_repo.list_by_run(run_id).await?;
    assert_eq!(steps.len(), 1);
    assert_eq!(steps[0].step_key, StepKey::Plan);

    Ok(())
}

// ── 2. set_step_summary durability ────────────────────────────────────

#[tokio::test]
async fn step_summary_round_trips_through_repo() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let repo = SqliteLaunchTaskRepo::new(pool);

    let (task, steps) =
        superkick_core::LaunchTask::new_with_v1_recipe("TEAM-7", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    let plan_step = steps.iter().find(|s| s.sequence == 1).unwrap();
    repo.set_step_summary(plan_step.id, Some("plan output".into()))
        .await?;

    let reloaded = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| s.id == plan_step.id)
        .expect("step persists");
    assert_eq!(reloaded.summary.as_deref(), Some("plan output"));

    repo.set_step_summary(plan_step.id, None).await?;
    let cleared = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| s.id == plan_step.id)
        .unwrap();
    assert!(cleared.summary.is_none());

    Ok(())
}

// ── 3. Executor persists summaries from Completed outcomes ────────────

/// Scripted runner: returns `Completed { summary: <step_kind name>" ok"}`
/// for every step, with a linked shadow `RunId` so we can assert
/// `add_step_links` was wired alongside `set_step_summary`.
struct SummaryEmittingRunner {
    shadow_run_id: RunId,
}

impl StepRunner for SummaryEmittingRunner {
    async fn run_step(
        &self,
        _task: &superkick_core::LaunchTask,
        step: &superkick_core::LaunchTaskStep,
        _cancel: CancellationToken,
    ) -> Result<StepOutcome> {
        let summary = format!("{} ok", step.step_kind);
        Ok(StepOutcome::Completed {
            summary: Some(summary),
            links: StepLinks {
                run_id: Some(self.shadow_run_id),
                conversation_id: None,
                orchestrator_session_id: None,
            },
        })
    }
}

#[tokio::test]
async fn executor_persists_step_summary_and_linked_run_on_completion() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let repo = Arc::new(SqliteLaunchTaskRepo::new(pool));
    let shadow_run_id = RunId::new();

    let (task, steps) =
        superkick_core::LaunchTask::new_with_v1_recipe("TEAM-9", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    let bus = LaunchTaskEventBus::new();
    let runner = Arc::new(SummaryEmittingRunner { shadow_run_id });
    let exec = LaunchTaskExecutor::new(
        Arc::clone(&repo),
        Arc::clone(&bus),
        Arc::new(LaunchTaskRegistry::new()),
        runner,
    );

    exec.run(task.id).await?;

    let reloaded_steps = repo.list_steps(task.id).await?;
    for step in &reloaded_steps {
        assert_eq!(
            step.status,
            LaunchTaskStepStatus::Completed,
            "{:?} should be Completed",
            step.step_kind
        );
        let expected_summary = format!("{} ok", step.step_kind);
        assert_eq!(
            step.summary.as_deref(),
            Some(expected_summary.as_str()),
            "summary for {:?} must persist",
            step.step_kind
        );
        assert_eq!(
            step.linked_run_id,
            Some(shadow_run_id),
            "linked_run_id must persist for {:?}",
            step.step_kind
        );
    }

    Ok(())
}

// ── 4. NeedsHuman path persists the reason as the step summary ───────

struct AlwaysFailRunner;

impl StepRunner for AlwaysFailRunner {
    async fn run_step(
        &self,
        _task: &superkick_core::LaunchTask,
        _step: &superkick_core::LaunchTaskStep,
        _cancel: CancellationToken,
    ) -> Result<StepOutcome> {
        Ok(StepOutcome::Failed {
            reason: "planner exited with code 2".into(),
        })
    }
}

#[tokio::test]
async fn executor_persists_failure_reason_into_step_summary() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let repo = Arc::new(SqliteLaunchTaskRepo::new(pool));

    let (task, steps) =
        superkick_core::LaunchTask::new_with_v1_recipe("TEAM-10", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    let bus = LaunchTaskEventBus::new();
    let exec = LaunchTaskExecutor::new(
        Arc::clone(&repo),
        Arc::clone(&bus),
        Arc::new(LaunchTaskRegistry::new()),
        Arc::new(AlwaysFailRunner),
    );

    exec.run(task.id).await?;

    let plan_step = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| matches!(s.step_kind, LaunchStepKind::Plan))
        .unwrap();
    assert_eq!(plan_step.status, LaunchTaskStepStatus::NeedsHuman);
    assert_eq!(
        plan_step.summary.as_deref(),
        Some("planner exited with code 2"),
        "NeedsHuman summary must echo the runner's reason"
    );
    Ok(())
}
