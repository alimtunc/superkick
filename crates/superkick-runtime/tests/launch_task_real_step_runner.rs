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

use std::sync::Arc;

use anyhow::Result;
use tokio_util::sync::CancellationToken;

use superkick_core::{
    AgentProvider, ExecutionMode, LaunchStepKind, LaunchTaskStatus, LaunchTaskStepStatus, Run,
    RunId, RunState, RunStep, StepKey, StepStatus, TriggerSource,
};
use superkick_runtime::test_support::{agents, catalog};
use superkick_runtime::{
    LaunchTaskEventBus, LaunchTaskExecutor, LaunchTaskRegistry, StepLinks, StepOutcome, StepRunner,
};
use superkick_storage::repo::{LaunchTaskRepo, RunRepo, RunStepRepo};
use superkick_storage::{SqliteLaunchTaskRepo, SqliteRunRepo, SqliteRunStepRepo, connect};

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
        _resume: Option<superkick_core::ResumeKey>,
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
            memory_entry_ids: Vec::new(),
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
        _resume: Option<superkick_core::ResumeKey>,
        _cancel: CancellationToken,
    ) -> Result<StepOutcome> {
        Ok(StepOutcome::NeedsHuman {
            classification: superkick_core::FailureClassification::AgentNonZeroExit {
                exit_code: 2,
                role: "planner".into(),
            },
            links: StepLinks::default(),
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
        Some("planner agent exited with code 2"),
        "NeedsHuman summary must echo the classification's human_summary()",
    );
    assert!(
        matches!(
            plan_step.failure_classification,
            Some(superkick_core::FailureClassification::AgentNonZeroExit { .. })
        ),
        "failure_classification column must carry the classifier verdict",
    );
    Ok(())
}

// ── 5. SUP-140 — classification persistence on each failure path ─────────

/// Scripted runner: emits an arbitrary `StepOutcome` for the Plan step.
/// All subsequent steps short-circuit to `Completed` so the test focuses on
/// the first step's persisted classification.
struct ScriptedClassifierRunner {
    plan_outcome: std::sync::Mutex<Option<StepOutcome>>,
}

impl ScriptedClassifierRunner {
    fn new(outcome: StepOutcome) -> Self {
        Self {
            plan_outcome: std::sync::Mutex::new(Some(outcome)),
        }
    }
}

impl StepRunner for ScriptedClassifierRunner {
    async fn run_step(
        &self,
        _task: &superkick_core::LaunchTask,
        step: &superkick_core::LaunchTaskStep,
        _resume: Option<superkick_core::ResumeKey>,
        _cancel: CancellationToken,
    ) -> Result<StepOutcome> {
        if matches!(step.step_kind, LaunchStepKind::Plan) {
            if let Some(outcome) = self.plan_outcome.lock().unwrap().take() {
                return Ok(outcome);
            }
        }
        Ok(StepOutcome::Completed {
            summary: None,
            links: StepLinks::default(),
            memory_entry_ids: Vec::new(),
        })
    }
}

async fn run_with_plan_outcome(outcome: StepOutcome) -> Result<superkick_core::LaunchTaskStep> {
    let pool = connect("sqlite::memory:").await?;
    let repo = Arc::new(SqliteLaunchTaskRepo::new(pool));
    let (task, steps) =
        superkick_core::LaunchTask::new_with_v1_recipe("SUP-140", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    let bus = LaunchTaskEventBus::new();
    let exec = LaunchTaskExecutor::new(
        Arc::clone(&repo),
        Arc::clone(&bus),
        Arc::new(LaunchTaskRegistry::new()),
        Arc::new(ScriptedClassifierRunner::new(outcome)),
    );

    exec.run(task.id).await?;

    let plan = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| matches!(s.step_kind, LaunchStepKind::Plan))
        .expect("plan step persists");
    Ok(plan)
}

#[tokio::test]
async fn completed_outcome_clears_failure_classification() -> Result<()> {
    let plan = run_with_plan_outcome(StepOutcome::Completed {
        summary: Some("done".into()),
        links: StepLinks::default(),
        memory_entry_ids: Vec::new(),
    })
    .await?;
    assert_eq!(plan.status, LaunchTaskStepStatus::Completed);
    assert!(
        plan.failure_classification.is_none(),
        "successful run must leave failure_classification clear: {:?}",
        plan.failure_classification
    );
    Ok(())
}

#[tokio::test]
async fn missing_marker_persists_classification_and_parks_needs_human() -> Result<()> {
    let plan = run_with_plan_outcome(StepOutcome::NeedsHuman {
        classification: superkick_core::FailureClassification::MissingMarker,
        links: StepLinks::default(),
    })
    .await?;

    assert_eq!(plan.status, LaunchTaskStepStatus::NeedsHuman);
    assert!(matches!(
        plan.failure_classification,
        Some(superkick_core::FailureClassification::MissingMarker)
    ));
    assert!(
        plan.summary.is_some(),
        "human-readable summary must persist"
    );
    Ok(())
}

#[tokio::test]
async fn missing_marker_routes_parent_task_to_needs_human() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let repo = Arc::new(SqliteLaunchTaskRepo::new(pool));
    let (task, steps) =
        superkick_core::LaunchTask::new_with_v1_recipe("SUP-140-A", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    let runner = Arc::new(ScriptedClassifierRunner::new(StepOutcome::NeedsHuman {
        classification: superkick_core::FailureClassification::MissingMarker,
        links: StepLinks::default(),
    }));
    let exec = LaunchTaskExecutor::new(
        Arc::clone(&repo),
        LaunchTaskEventBus::new(),
        Arc::new(LaunchTaskRegistry::new()),
        runner,
    );
    exec.run(task.id).await?;

    let reloaded = repo.get(task.id).await?.expect("task persists");
    assert_eq!(reloaded.status, LaunchTaskStatus::NeedsHuman);
    Ok(())
}

#[tokio::test]
async fn auth_required_hint_persists_with_provider_and_parks_needs_human() -> Result<()> {
    let plan = run_with_plan_outcome(StepOutcome::NeedsHuman {
        classification: superkick_core::FailureClassification::AuthRequired {
            provider: AgentProvider::Claude,
        },
        links: StepLinks::default(),
    })
    .await?;

    assert_eq!(plan.status, LaunchTaskStepStatus::NeedsHuman);
    assert_eq!(
        plan.failure_classification,
        Some(superkick_core::FailureClassification::AuthRequired {
            provider: AgentProvider::Claude,
        })
    );
    let summary = plan.summary.unwrap_or_default();
    assert!(
        summary.to_lowercase().contains("claude") && summary.to_lowercase().contains("auth"),
        "human_summary must mention provider + auth, got {summary:?}",
    );
    Ok(())
}

#[tokio::test]
async fn timeout_classification_persists_and_parks_needs_human() -> Result<()> {
    use std::time::Duration;

    let plan = run_with_plan_outcome(StepOutcome::NeedsHuman {
        classification: superkick_core::FailureClassification::Timeout {
            after: Duration::from_secs(600),
        },
        links: StepLinks::default(),
    })
    .await?;

    assert_eq!(plan.status, LaunchTaskStepStatus::NeedsHuman);
    assert!(matches!(
        plan.failure_classification,
        Some(superkick_core::FailureClassification::Timeout { .. })
    ));
    Ok(())
}

#[tokio::test]
async fn terminal_failure_routes_parent_task_to_failed() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let repo = Arc::new(SqliteLaunchTaskRepo::new(pool));
    let (task, steps) =
        superkick_core::LaunchTask::new_with_v1_recipe("SUP-140-B", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    let outcome = StepOutcome::Failed {
        classification: superkick_core::FailureClassification::CliMissing {
            binary: "claude".into(),
            install_hint: "see README".into(),
        },
        links: StepLinks::default(),
    };
    let runner = Arc::new(ScriptedClassifierRunner::new(outcome));
    let exec = LaunchTaskExecutor::new(
        Arc::clone(&repo),
        LaunchTaskEventBus::new(),
        Arc::new(LaunchTaskRegistry::new()),
        runner,
    );
    exec.run(task.id).await?;

    let reloaded = repo.get(task.id).await?.expect("task persists");
    assert_eq!(
        reloaded.status,
        LaunchTaskStatus::Failed,
        "Failed-disposition step must propagate to task → Failed, not NeedsHuman",
    );

    let plan = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| matches!(s.step_kind, LaunchStepKind::Plan))
        .expect("plan step persists");
    assert_eq!(plan.status, LaunchTaskStepStatus::Failed);
    assert!(matches!(
        plan.failure_classification,
        Some(superkick_core::FailureClassification::CliMissing { .. })
    ));
    Ok(())
}

#[tokio::test]
async fn retry_clearing_classification_on_subsequent_completion() -> Result<()> {
    use std::sync::atomic::{AtomicUsize, Ordering};

    let pool = connect("sqlite::memory:").await?;
    let repo = Arc::new(SqliteLaunchTaskRepo::new(pool));
    let (task, steps) =
        superkick_core::LaunchTask::new_with_v1_recipe("SUP-140-C", agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;

    // First call: park NeedsHuman with MissingMarker. Second call (retry):
    // return Completed — the executor must wipe the persisted classification.
    struct RetryRunner {
        calls: AtomicUsize,
    }
    impl StepRunner for RetryRunner {
        async fn run_step(
            &self,
            _task: &superkick_core::LaunchTask,
            step: &superkick_core::LaunchTaskStep,
            _resume: Option<superkick_core::ResumeKey>,
            _cancel: CancellationToken,
        ) -> Result<StepOutcome> {
            if !matches!(step.step_kind, LaunchStepKind::Plan) {
                return Ok(StepOutcome::Completed {
                    summary: None,
                    links: StepLinks::default(),
                    memory_entry_ids: Vec::new(),
                });
            }
            let n = self.calls.fetch_add(1, Ordering::SeqCst);
            if n == 0 {
                Ok(StepOutcome::NeedsHuman {
                    classification: superkick_core::FailureClassification::MissingMarker,
                    links: StepLinks::default(),
                })
            } else {
                Ok(StepOutcome::Completed {
                    summary: Some("retry succeeded".into()),
                    links: StepLinks::default(),
                    memory_entry_ids: Vec::new(),
                })
            }
        }
    }

    let runner = Arc::new(RetryRunner {
        calls: AtomicUsize::new(0),
    });
    let exec = LaunchTaskExecutor::new(
        Arc::clone(&repo),
        LaunchTaskEventBus::new(),
        Arc::new(LaunchTaskRegistry::new()),
        runner,
    );

    exec.run(task.id).await?;
    let after_first = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| matches!(s.step_kind, LaunchStepKind::Plan))
        .unwrap();
    assert!(after_first.failure_classification.is_some());

    exec.retry_needs_human_step(task.id).await.unwrap();
    let after_retry = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| matches!(s.step_kind, LaunchStepKind::Plan))
        .unwrap();
    assert_eq!(after_retry.status, LaunchTaskStepStatus::Completed);
    assert!(
        after_retry.failure_classification.is_none(),
        "successful retry must clear failure_classification, got {:?}",
        after_retry.failure_classification,
    );
    Ok(())
}
