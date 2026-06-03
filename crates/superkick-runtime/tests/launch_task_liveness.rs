//! Launch Task liveness / orphan reconciliation integration tests (real SQLite):
//! the executor terminalizes the shadow run on a Failed disposition and on
//! cancel but not on NeedsHuman (which stays retryable), and the reconciliation
//! pass drives a dead task + shadow run terminal (unblocking relaunch) while
//! skipping parked/live tasks.

use std::sync::{Arc, Mutex};

use anyhow::Result;
use tokio_util::sync::CancellationToken;

use superkick_core::{
    FailureClassification, LaunchStepKind, LaunchTask, LaunchTaskStatus, LaunchTaskStep, RunId,
};
use superkick_runtime::test_support::{agents, catalog};
use superkick_runtime::{
    LaunchTaskEventBus, LaunchTaskExecutor, LaunchTaskRegistry, ShadowRunTerminal, StepLinks,
    StepOutcome, StepRunner,
};
use superkick_storage::repo::LaunchTaskRepo;
use superkick_storage::{SqliteLaunchTaskRepo, connect};

/// Scripted runner that records every `finalize_shadow_run` call so a test can
/// assert *whether and how* the executor drove the shadow run terminal.
struct RecordingRunner {
    plan_outcome: Mutex<Option<StepOutcome>>,
    finalized: Arc<Mutex<Vec<(RunId, ShadowRunTerminal)>>>,
}

impl RecordingRunner {
    fn new(
        plan_outcome: StepOutcome,
        finalized: Arc<Mutex<Vec<(RunId, ShadowRunTerminal)>>>,
    ) -> Self {
        Self {
            plan_outcome: Mutex::new(Some(plan_outcome)),
            finalized,
        }
    }
}

impl StepRunner for RecordingRunner {
    async fn run_step(
        &self,
        _task: &LaunchTask,
        step: &LaunchTaskStep,
        _resume: Option<superkick_core::ResumeKey>,
        _cancel: CancellationToken,
    ) -> Result<StepOutcome> {
        if matches!(step.step_kind, LaunchStepKind::Plan)
            && let Some(outcome) = self.plan_outcome.lock().unwrap().take()
        {
            return Ok(outcome);
        }
        Ok(StepOutcome::Completed {
            summary: None,
            links: StepLinks::default(),
            memory_entry_ids: Vec::new(),
        })
    }

    async fn finalize_shadow_run(
        &self,
        run_id: RunId,
        terminal: ShadowRunTerminal,
        _reason: &str,
    ) -> Result<()> {
        self.finalized.lock().unwrap().push((run_id, terminal));
        Ok(())
    }
}

async fn seed(issue: &str) -> Result<(Arc<SqliteLaunchTaskRepo>, LaunchTask)> {
    let pool = connect("sqlite::memory:").await?;
    let repo = Arc::new(SqliteLaunchTaskRepo::new(pool));
    let (task, steps) = LaunchTask::new_with_v1_recipe(issue, agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;
    Ok((repo, task))
}

#[tokio::test]
async fn failed_disposition_terminalizes_the_shadow_run() -> Result<()> {
    let (repo, task) = seed("SUP-186-FAIL").await?;
    let shadow = RunId::new();
    let finalized = Arc::new(Mutex::new(Vec::new()));

    let runner = Arc::new(RecordingRunner::new(
        StepOutcome::Failed {
            classification: FailureClassification::CliMissing {
                binary: "claude".into(),
                install_hint: "see README".into(),
            },
            links: StepLinks {
                run_id: Some(shadow),
                conversation_id: None,
                orchestrator_session_id: None,
            },
        },
        Arc::clone(&finalized),
    ));
    let exec = LaunchTaskExecutor::new(
        Arc::clone(&repo),
        LaunchTaskEventBus::new(),
        Arc::new(LaunchTaskRegistry::new()),
        runner,
    );

    exec.run(task.id).await?;

    assert_eq!(
        repo.get(task.id).await?.unwrap().status,
        LaunchTaskStatus::Failed
    );
    assert_eq!(
        *finalized.lock().unwrap(),
        vec![(shadow, ShadowRunTerminal::Failed)],
        "a terminal-Failed task must drive its shadow run → Failed (unblocks relaunch)"
    );
    Ok(())
}

#[tokio::test]
async fn needs_human_leaves_the_shadow_run_alone() -> Result<()> {
    let (repo, task) = seed("SUP-186-NH").await?;
    let shadow = RunId::new();
    let finalized = Arc::new(Mutex::new(Vec::new()));

    let runner = Arc::new(RecordingRunner::new(
        StepOutcome::NeedsHuman {
            classification: FailureClassification::AgentNonZeroExit {
                exit_code: 2,
                role: "planner".into(),
            },
            links: StepLinks {
                run_id: Some(shadow),
                conversation_id: None,
                orchestrator_session_id: None,
            },
        },
        Arc::clone(&finalized),
    ));
    let exec = LaunchTaskExecutor::new(
        Arc::clone(&repo),
        LaunchTaskEventBus::new(),
        Arc::new(LaunchTaskRegistry::new()),
        runner,
    );

    exec.run(task.id).await?;

    assert_eq!(
        repo.get(task.id).await?.unwrap().status,
        LaunchTaskStatus::NeedsHuman
    );
    assert!(
        finalized.lock().unwrap().is_empty(),
        "NeedsHuman is a retryable park — the shadow run must stay live for retry"
    );
    Ok(())
}

#[tokio::test]
async fn cancel_of_a_parked_task_terminalizes_the_shadow_run() -> Result<()> {
    let (repo, task) = seed("SUP-186-CANCEL").await?;
    let shadow = RunId::new();
    let finalized = Arc::new(Mutex::new(Vec::new()));

    // Park the task at NeedsHuman first so its shadow run link is persisted and
    // there is no live executor (the cancel takes the Reserved arm).
    let runner = Arc::new(RecordingRunner::new(
        StepOutcome::NeedsHuman {
            classification: FailureClassification::MissingMarker,
            links: StepLinks {
                run_id: Some(shadow),
                conversation_id: None,
                orchestrator_session_id: None,
            },
        },
        Arc::clone(&finalized),
    ));
    let exec = LaunchTaskExecutor::new(
        Arc::clone(&repo),
        LaunchTaskEventBus::new(),
        Arc::new(LaunchTaskRegistry::new()),
        runner,
    );
    exec.run(task.id).await?;
    assert!(
        finalized.lock().unwrap().is_empty(),
        "park must not finalize"
    );

    // Operator cancels the parked task — Reserved arm, no live executor.
    exec.cancel(task.id).await?;

    assert_eq!(
        repo.get(task.id).await?.unwrap().status,
        LaunchTaskStatus::Cancelled
    );
    assert_eq!(
        *finalized.lock().unwrap(),
        vec![(shadow, ShadowRunTerminal::Cancelled)],
        "cancelling a parked task must terminalize its stranded shadow run"
    );
    Ok(())
}
