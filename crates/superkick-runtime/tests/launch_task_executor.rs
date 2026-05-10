//! SUP-118 — `LaunchTaskExecutor` integration tests.
//!
//! Hits a real in-memory SQLite per CLAUDE.md rule 9 — `LaunchTaskRepo` is
//! never mocked. The plan asked for three separate test files; we co-locate
//! the three scenarios here because they share the entire fixture (catalog,
//! agents, repo bootstrap) and splitting them would only duplicate ~80 lines
//! of glue. Each scenario is its own `#[tokio::test]`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::Result;
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

use superkick_core::{
    AgentCatalog, AgentProvider, CoreAgentDefinition, LaunchStepKind, LaunchTask, LaunchTaskId,
    LaunchTaskStatus, LaunchTaskStep, LaunchTaskStepStatus, LinearContextMode,
    PlanImplementReviewAgents, ResolvedMcpPolicy, ResolvedToolPolicy,
};
use superkick_runtime::{
    LaunchTaskEvent, LaunchTaskEventBus, LaunchTaskExecutor, LaunchTaskRegistry, StepLinks,
    StepOutcome, StepRunner,
};
use superkick_storage::repo::LaunchTaskRepo;
use superkick_storage::{SqliteLaunchTaskRepo, connect};

// ── Fixture ────────────────────────────────────────────────────────────

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

async fn fresh_repo() -> Result<Arc<SqliteLaunchTaskRepo>> {
    let pool = connect("sqlite::memory:").await?;
    Ok(Arc::new(SqliteLaunchTaskRepo::new(pool)))
}

async fn create_task(
    repo: &SqliteLaunchTaskRepo,
    linear_issue_id: &str,
) -> Result<(LaunchTask, Vec<LaunchTaskStep>)> {
    let (task, steps) = LaunchTask::new_with_v1_recipe(linear_issue_id, agents(), &catalog())?;
    repo.insert_with_steps(&task, &steps).await?;
    Ok((task, steps))
}

/// Drain every event currently waiting on the bus into a Vec. Polls until
/// the receiver has nothing left, with a tight per-recv timeout so the test
/// never hangs on an unexpected silence.
async fn drain_events(
    rx: &mut tokio::sync::broadcast::Receiver<LaunchTaskEvent>,
) -> Vec<LaunchTaskEvent> {
    let mut out = Vec::new();
    while let Ok(Ok(event)) = tokio::time::timeout(Duration::from_millis(50), rx.recv()).await {
        out.push(event);
    }
    out
}

// ── Scripted fake StepRunner ──────────────────────────────────────────

/// What the fake runner should do for the next step it sees, per kind. Each
/// kind has its own queue so tests can script asymmetric behaviour (e.g.
/// "planner ok, coder fail, reviewer never reached").
#[derive(Clone)]
enum ScriptedAction {
    Complete {
        summary: Option<String>,
    },
    Fail {
        reason: String,
    },
    /// Park forever until the supplied notify fires, then check the cancel
    /// token. Used by the cancellation test.
    WaitThenCheck {
        release: Arc<Notify>,
    },
}

#[derive(Default)]
struct FakeStepRunnerInner {
    plan: Vec<ScriptedAction>,
    implement: Vec<ScriptedAction>,
    review: Vec<ScriptedAction>,
    /// Records every kind that the runner saw, in order. The cancellation
    /// test uses this to assert that downstream steps were never invoked.
    observed: Vec<LaunchStepKind>,
}

#[derive(Clone)]
struct FakeStepRunner {
    inner: Arc<Mutex<FakeStepRunnerInner>>,
}

impl FakeStepRunner {
    fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(FakeStepRunnerInner::default())),
        }
    }

    fn script(&self, kind: LaunchStepKind, action: ScriptedAction) {
        let mut g = self.inner.lock().unwrap();
        match kind {
            LaunchStepKind::Plan => g.plan.push(action),
            LaunchStepKind::Implement => g.implement.push(action),
            LaunchStepKind::Review => g.review.push(action),
        }
    }

    fn observed(&self) -> Vec<LaunchStepKind> {
        self.inner.lock().unwrap().observed.clone()
    }
}

impl StepRunner for FakeStepRunner {
    async fn run_step(
        &self,
        _task: &LaunchTask,
        step: &LaunchTaskStep,
        cancel: CancellationToken,
    ) -> Result<StepOutcome> {
        let action = {
            let mut g = self.inner.lock().unwrap();
            g.observed.push(step.step_kind);
            let queue = match step.step_kind {
                LaunchStepKind::Plan => &mut g.plan,
                LaunchStepKind::Implement => &mut g.implement,
                LaunchStepKind::Review => &mut g.review,
            };
            queue
                .pop()
                .unwrap_or(ScriptedAction::Complete { summary: None })
        };

        match action {
            ScriptedAction::Complete { summary } => Ok(StepOutcome::Completed {
                summary,
                links: StepLinks::default(),
            }),
            ScriptedAction::Fail { reason } => Ok(StepOutcome::Failed { reason }),
            ScriptedAction::WaitThenCheck { release } => {
                tokio::select! {
                    _ = release.notified() => {
                        // Tests fire `release` *after* the cancel; re-check
                        // the token so the runner observes it deterministically.
                        if cancel.is_cancelled() {
                            Ok(StepOutcome::Cancelled)
                        } else {
                            Ok(StepOutcome::Completed {
                                summary: None,
                                links: StepLinks::default(),
                            })
                        }
                    }
                    _ = cancel.cancelled() => Ok(StepOutcome::Cancelled),
                }
            }
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────

fn build_executor(
    repo: Arc<SqliteLaunchTaskRepo>,
    runner: Arc<FakeStepRunner>,
) -> (
    Arc<LaunchTaskExecutor<SqliteLaunchTaskRepo, FakeStepRunner>>,
    Arc<LaunchTaskEventBus>,
    Arc<LaunchTaskRegistry>,
) {
    let bus = LaunchTaskEventBus::new();
    let registry = Arc::new(LaunchTaskRegistry::new());
    let exec = LaunchTaskExecutor::new(repo, Arc::clone(&bus), Arc::clone(&registry), runner);
    (exec, bus, registry)
}

async fn step_status(
    repo: &SqliteLaunchTaskRepo,
    task_id: LaunchTaskId,
    kind: LaunchStepKind,
) -> LaunchTaskStepStatus {
    let steps = repo.list_steps(task_id).await.unwrap();
    steps
        .into_iter()
        .find(|s| s.step_kind == kind)
        .unwrap()
        .status
}

// ── Tests ─────────────────────────────────────────────────────────────

#[tokio::test]
async fn happy_path_three_steps_complete_drives_task_to_completed() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-1").await?;

    let runner = Arc::new(FakeStepRunner::new());
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::Complete {
            summary: Some("plan ok".into()),
        },
    );
    runner.script(
        LaunchStepKind::Implement,
        ScriptedAction::Complete {
            summary: Some("implement ok".into()),
        },
    );
    runner.script(
        LaunchStepKind::Review,
        ScriptedAction::Complete {
            summary: Some("review ok".into()),
        },
    );

    let (exec, bus, _registry) = build_executor(Arc::clone(&repo), Arc::clone(&runner));
    let mut rx = bus.subscribe();

    exec.run(task.id).await?;

    let reloaded = repo.get(task.id).await?.unwrap();
    assert_eq!(reloaded.status, LaunchTaskStatus::Completed);
    assert_eq!(reloaded.current_step_id, None);

    for kind in [
        LaunchStepKind::Plan,
        LaunchStepKind::Implement,
        LaunchStepKind::Review,
    ] {
        assert_eq!(
            step_status(&repo, task.id, kind).await,
            LaunchTaskStepStatus::Completed,
            "{kind:?} should be Completed"
        );
    }

    let events = drain_events(&mut rx).await;
    // Expected: TaskStatusChanged(Running), 3 × StepStarted, 3 × StepFinished,
    // TaskStatusChanged(Completed). 8 events total.
    assert_eq!(events.len(), 8, "events captured: {events:?}");
    let started = events
        .iter()
        .filter(|e| matches!(e, LaunchTaskEvent::StepStarted { .. }))
        .count();
    let finished = events
        .iter()
        .filter(|e| matches!(e, LaunchTaskEvent::StepFinished { .. }))
        .count();
    assert_eq!(started, 3);
    assert_eq!(finished, 3);
    let task_status_events: Vec<&LaunchTaskEvent> = events
        .iter()
        .filter(|e| matches!(e, LaunchTaskEvent::TaskStatusChanged { .. }))
        .collect();
    assert_eq!(task_status_events.len(), 2);
    Ok(())
}

#[tokio::test]
async fn planner_failure_drives_task_to_needs_human_with_pending_implement_and_review() -> Result<()>
{
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-2").await?;

    let runner = Arc::new(FakeStepRunner::new());
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::Fail {
            reason: "planner exploded".into(),
        },
    );

    let (exec, _bus, _) = build_executor(Arc::clone(&repo), Arc::clone(&runner));
    exec.run(task.id).await?;

    let reloaded = repo.get(task.id).await?.unwrap();
    assert_eq!(reloaded.status, LaunchTaskStatus::NeedsHuman);

    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Plan).await,
        LaunchTaskStepStatus::Failed
    );
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Implement).await,
        LaunchTaskStepStatus::Pending,
        "implement step must be left untouched when planner fails (V1 policy)"
    );
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Review).await,
        LaunchTaskStepStatus::Pending,
        "review step must be left untouched when planner fails (V1 policy)"
    );
    assert_eq!(runner.observed(), vec![LaunchStepKind::Plan]);
    Ok(())
}

#[tokio::test]
async fn coder_failure_drives_task_to_needs_human_with_completed_plan_and_pending_review()
-> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-3").await?;

    let runner = Arc::new(FakeStepRunner::new());
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::Complete { summary: None },
    );
    runner.script(
        LaunchStepKind::Implement,
        ScriptedAction::Fail {
            reason: "code didn't compile".into(),
        },
    );

    let (exec, _, _) = build_executor(Arc::clone(&repo), Arc::clone(&runner));
    exec.run(task.id).await?;

    let reloaded = repo.get(task.id).await?.unwrap();
    assert_eq!(reloaded.status, LaunchTaskStatus::NeedsHuman);
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Plan).await,
        LaunchTaskStepStatus::Completed
    );
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Implement).await,
        LaunchTaskStepStatus::Failed
    );
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Review).await,
        LaunchTaskStepStatus::Pending
    );
    Ok(())
}

#[tokio::test]
async fn reviewer_failure_drives_task_to_needs_human() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-4").await?;

    let runner = Arc::new(FakeStepRunner::new());
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::Complete { summary: None },
    );
    runner.script(
        LaunchStepKind::Implement,
        ScriptedAction::Complete { summary: None },
    );
    runner.script(
        LaunchStepKind::Review,
        ScriptedAction::Fail {
            reason: "reviewer rejected".into(),
        },
    );

    let (exec, _, _) = build_executor(Arc::clone(&repo), Arc::clone(&runner));
    exec.run(task.id).await?;

    let reloaded = repo.get(task.id).await?.unwrap();
    assert_eq!(reloaded.status, LaunchTaskStatus::NeedsHuman);
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Plan).await,
        LaunchTaskStepStatus::Completed
    );
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Implement).await,
        LaunchTaskStepStatus::Completed
    );
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Review).await,
        LaunchTaskStepStatus::Failed
    );
    Ok(())
}

#[tokio::test]
async fn cancel_mid_step_marks_task_and_current_step_cancelled() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-5").await?;

    // Planner parks until we explicitly release it. After we cancel, the
    // runner observes the cancel token and returns Cancelled — even if we
    // never fire the release.
    let release = Arc::new(Notify::new());
    let runner = Arc::new(FakeStepRunner::new());
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::WaitThenCheck {
            release: Arc::clone(&release),
        },
    );

    let (exec, _bus, registry) = build_executor(Arc::clone(&repo), Arc::clone(&runner));

    // Spawn the executor in the background so we can race a cancel against it.
    let exec_for_run = Arc::clone(&exec);
    let task_id = task.id;
    let exec_handle = tokio::spawn(async move { exec_for_run.run(task_id).await });

    // Wait for the registry to register the task — this confirms the executor
    // has reached the spawn point and the planner step is running. Polling
    // here is fine; the executor registers synchronously before the first
    // repo write.
    for _ in 0..100 {
        if registry.contains(task_id) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert!(
        registry.contains(task_id),
        "executor should have registered cancel token before running the planner step"
    );

    // Wait until the planner step actually transitions to Running so we know
    // the cancel will land "mid-step" and not before the loop reached it.
    for _ in 0..100 {
        if matches!(
            step_status(&repo, task_id, LaunchStepKind::Plan).await,
            LaunchTaskStepStatus::Running
        ) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }

    assert!(registry.cancel(task_id), "cancel must signal a live token");
    exec_handle.await??;

    let reloaded = repo.get(task_id).await?.unwrap();
    assert_eq!(reloaded.status, LaunchTaskStatus::Cancelled);
    assert_eq!(
        step_status(&repo, task_id, LaunchStepKind::Plan).await,
        LaunchTaskStepStatus::Cancelled
    );
    assert_eq!(
        step_status(&repo, task_id, LaunchStepKind::Implement).await,
        LaunchTaskStepStatus::Pending,
        "implement step must be untouched when planner is cancelled"
    );
    assert_eq!(
        step_status(&repo, task_id, LaunchStepKind::Review).await,
        LaunchTaskStepStatus::Pending,
        "review step must be untouched when planner is cancelled"
    );
    // Sanity: the released notify is never used in this test path; bind so
    // clippy doesn't warn about unused.
    let _ = release;
    Ok(())
}

#[tokio::test]
async fn run_is_idempotent_for_terminal_tasks() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-6").await?;
    repo.update_task_status(task.id, LaunchTaskStatus::Cancelled)
        .await?;

    let runner = Arc::new(FakeStepRunner::new());
    let (exec, _, _) = build_executor(Arc::clone(&repo), Arc::clone(&runner));
    exec.run(task.id).await?;

    assert!(
        runner.observed().is_empty(),
        "terminal task should not invoke the step runner"
    );
    let reloaded = repo.get(task.id).await?.unwrap();
    assert_eq!(reloaded.status, LaunchTaskStatus::Cancelled);
    Ok(())
}
