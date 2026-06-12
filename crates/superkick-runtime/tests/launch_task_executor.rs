//! SUP-118 — `LaunchTaskExecutor` integration tests.
//!
//! Hits a real in-memory SQLite per CLAUDE.md rule 9 — `LaunchTaskRepo` is
//! never mocked. The plan asked for three separate test files; we co-locate
//! the three scenarios here because they share the entire fixture (catalog,
//! agents, repo bootstrap) and splitting them would only duplicate ~80 lines
//! of glue. Each scenario is its own `#[tokio::test]`.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::Result;
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;

use superkick_core::{
    AgentProvider, OutputExpectation, ProfileKind, ProfileSnapshot, ReasoningEffort, SessionPolicy,
    SkillSource, StepExecutor, StepSnapshot,
};
use superkick_core::{
    CoreError, FailureClassification, LaunchStepKind, LaunchTask, LaunchTaskId, LaunchTaskStatus,
    LaunchTaskStep, LaunchTaskStepStatus, ResumeKey, RunId,
};
use superkick_runtime::test_support::{agents, catalog, drain_events};
use superkick_runtime::{
    CancelDecision, DiffSnapshot, LaunchTaskEvent, LaunchTaskEventBus, LaunchTaskExecutor,
    LaunchTaskRegistry, RetryError, StepLinks, StepOutcome, StepRunner,
};
use superkick_storage::repo::LaunchTaskRepo;
use superkick_storage::{SqliteLaunchTaskRepo, connect};

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

/// A dynamic task whose middle (Implement) step is disabled, so the
/// executor must skip it without spawning and still drive Plan → Review.
fn dyn_step(
    ordering: u32,
    kind: LaunchStepKind,
    output: OutputExpectation,
    enabled: bool,
) -> StepSnapshot {
    StepSnapshot {
        ordering,
        label: kind.to_string(),
        skill_ref: kind.to_string(),
        skill_source: SkillSource::Installed(kind.to_string()),
        skill_kind: None,
        step_kind: kind,
        provider: AgentProvider::Codex,
        model: None,
        reasoning: ReasoningEffort::Medium,
        executor: StepExecutor::CodexStructured,
        session_policy: SessionPolicy::Fresh,
        output_expectation: output,
        enabled,
    }
}

async fn create_dynamic_task_disabled_implement(
    repo: &SqliteLaunchTaskRepo,
    linear_issue_id: &str,
) -> Result<(LaunchTask, Vec<LaunchTaskStep>)> {
    let snapshot = ProfileSnapshot {
        profile_id: "standard".into(),
        profile_name: "Standard".into(),
        profile_kind: ProfileKind::Standard,
        steps: vec![
            dyn_step(1, LaunchStepKind::Plan, OutputExpectation::Plan, true),
            dyn_step(
                2,
                LaunchStepKind::Implement,
                OutputExpectation::Patch,
                false,
            ),
            dyn_step(3, LaunchStepKind::Review, OutputExpectation::Review, true),
        ],
    };
    let (task, steps) = LaunchTask::new_dynamic(linear_issue_id, snapshot)?;
    repo.insert_with_steps(&task, &steps).await?;
    Ok((task, steps))
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
    /// SUP-120 — script a Completed outcome that also publishes a `linked_run_id`.
    /// Tests use this to verify retry produces a *new* `RunId` distinct from
    /// the link recorded on the previous attempt.
    CompleteWithRun {
        run_id: RunId,
    },
    Fail {
        reason: String,
    },
    FailWith {
        classification: FailureClassification,
    },
    /// SUP-191 — a mid-turn timeout. `resume_key` is the Codex thread the
    /// adapter captured (`None` simulates a pre-`SessionMeta` crash), and
    /// `diff_token` seeds the worktree diff fingerprint so tests can script
    /// progress (distinct tokens) vs. a stuck agent (same token twice).
    TimeOut {
        resume_key: Option<String>,
        diff_token: String,
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
    /// SUP-191 — the `resume` key the executor threaded into each call, so the
    /// auto-resume tests can assert the loop resumes with the right thread.
    resumes: Vec<(LaunchStepKind, Option<String>)>,
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

    /// Resume keys the executor passed in for a given step kind, in order.
    fn resumes_for(&self, kind: LaunchStepKind) -> Vec<Option<String>> {
        self.inner
            .lock()
            .unwrap()
            .resumes
            .iter()
            .filter(|(k, _)| *k == kind)
            .map(|(_, r)| r.clone())
            .collect()
    }
}

impl StepRunner for FakeStepRunner {
    async fn run_step(
        &self,
        _task: &LaunchTask,
        step: &LaunchTaskStep,
        resume: Option<ResumeKey>,
        cancel: CancellationToken,
    ) -> Result<StepOutcome> {
        let action = {
            let mut g = self.inner.lock().unwrap();
            g.observed.push(step.step_kind);
            g.resumes.push((
                step.step_kind,
                resume.as_ref().map(|k| k.as_str().to_string()),
            ));
            let queue = match step.step_kind {
                LaunchStepKind::Plan => &mut g.plan,
                LaunchStepKind::Implement => &mut g.implement,
                LaunchStepKind::Review => &mut g.review,
            };
            // FIFO — `script` pushes in invocation order, so retry tests that
            // re-run the same step kind get the actions back in the order
            // they were scripted.
            if queue.is_empty() {
                ScriptedAction::Complete { summary: None }
            } else {
                queue.remove(0)
            }
        };

        match action {
            ScriptedAction::Complete { summary } => Ok(StepOutcome::Completed {
                summary,
                links: StepLinks::default(),
                memory_entry_ids: Vec::new(),
            }),
            ScriptedAction::CompleteWithRun { run_id } => Ok(StepOutcome::Completed {
                summary: None,
                links: StepLinks {
                    run_id: Some(run_id),
                    ..StepLinks::default()
                },
                memory_entry_ids: Vec::new(),
            }),
            ScriptedAction::Fail { reason } => {
                // Default fake-runner failure parks the step at NeedsHuman
                // (retryable) — mirrors the original test contract while
                // exercising the new classification-aware executor path.
                let classification = FailureClassification::AgentReported {
                    status: superkick_core::StepResultStatus::NeedsHuman,
                    summary: reason,
                };
                Ok(StepOutcome::NeedsHuman {
                    classification,
                    links: StepLinks::default(),
                })
            }
            ScriptedAction::FailWith { classification } => {
                let outcome = match classification.disposition() {
                    superkick_core::FailureDisposition::NeedsHuman => StepOutcome::NeedsHuman {
                        classification,
                        links: StepLinks::default(),
                    },
                    superkick_core::FailureDisposition::Failed => StepOutcome::Failed {
                        classification,
                        links: StepLinks::default(),
                    },
                };
                Ok(outcome)
            }
            ScriptedAction::TimeOut {
                resume_key,
                diff_token,
            } => Ok(StepOutcome::TimedOut {
                classification: FailureClassification::Timeout {
                    after: Duration::from_secs(600),
                },
                links: StepLinks::default(),
                resume_key: resume_key.map(ResumeKey::new),
                diff_snapshot: DiffSnapshot::of(diff_token.as_bytes()),
            }),
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
                                memory_entry_ids: Vec::new(),
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

/// SUP-191 — executor with an explicit auto-resume ceiling so the auto-resume
/// tests can drive a small `N` deterministically.
fn build_executor_with_max(
    repo: Arc<SqliteLaunchTaskRepo>,
    runner: Arc<FakeStepRunner>,
    max_auto_resumes: u32,
) -> (
    Arc<LaunchTaskExecutor<SqliteLaunchTaskRepo, FakeStepRunner>>,
    Arc<LaunchTaskEventBus>,
    Arc<LaunchTaskRegistry>,
) {
    let bus = LaunchTaskEventBus::new();
    let registry = Arc::new(LaunchTaskRegistry::new());
    let exec = LaunchTaskExecutor::with_max_auto_resumes(
        repo,
        Arc::clone(&bus),
        Arc::clone(&registry),
        runner,
        max_auto_resumes,
    );
    (exec, bus, registry)
}

async fn step_resume_count(
    repo: &SqliteLaunchTaskRepo,
    task_id: LaunchTaskId,
    kind: LaunchStepKind,
) -> u32 {
    let steps = repo.list_steps(task_id).await.unwrap();
    steps
        .into_iter()
        .find(|s| s.step_kind == kind)
        .unwrap()
        .auto_resume_count
}

async fn step_summary(
    repo: &SqliteLaunchTaskRepo,
    task_id: LaunchTaskId,
    kind: LaunchStepKind,
) -> String {
    let steps = repo.list_steps(task_id).await.unwrap();
    steps
        .into_iter()
        .find(|s| s.step_kind == kind)
        .unwrap()
        .summary
        .unwrap_or_default()
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
async fn disabled_step_is_skipped_without_spawning() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_dynamic_task_disabled_implement(&repo, "TEAM-DYN").await?;

    let runner = Arc::new(FakeStepRunner::new());
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::Complete {
            summary: Some("plan ok".into()),
        },
    );
    runner.script(
        LaunchStepKind::Review,
        ScriptedAction::Complete {
            summary: Some("review ok".into()),
        },
    );
    // No Implement script — the disabled step must never reach the runner.

    let (exec, _bus, _registry) = build_executor(Arc::clone(&repo), Arc::clone(&runner));
    exec.run(task.id).await?;

    let reloaded = repo.get(task.id).await?.unwrap();
    assert_eq!(reloaded.status, LaunchTaskStatus::Completed);
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Implement).await,
        LaunchTaskStepStatus::Skipped
    );
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Plan).await,
        LaunchTaskStepStatus::Completed
    );
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Review).await,
        LaunchTaskStepStatus::Completed
    );
    assert_eq!(
        runner.observed(),
        vec![LaunchStepKind::Plan, LaunchStepKind::Review]
    );
    Ok(())
}

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
        LaunchTaskStepStatus::NeedsHuman,
        "blocking step parks in NeedsHuman so SUP-120 retry has a non-terminal source state"
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
        LaunchTaskStepStatus::NeedsHuman
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
        LaunchTaskStepStatus::NeedsHuman
    );
    Ok(())
}

#[tokio::test]
async fn step_finished_event_carries_failure_classification_on_halt() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-141").await?;

    let runner = Arc::new(FakeStepRunner::new());
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::FailWith {
            classification: FailureClassification::MissingMarker,
        },
    );

    let (exec, bus, _) = build_executor(Arc::clone(&repo), Arc::clone(&runner));
    let mut rx = bus.subscribe();
    exec.run(task.id).await?;

    let events = drain_events(&mut rx).await;
    let finished = events
        .iter()
        .find_map(|e| match e {
            LaunchTaskEvent::StepFinished {
                status: LaunchTaskStepStatus::NeedsHuman,
                failure_classification,
                ..
            } => Some(failure_classification.clone()),
            _ => None,
        })
        .expect("expected a StepFinished(NeedsHuman) event");
    assert_eq!(
        finished,
        Some(FailureClassification::MissingMarker),
        "executor must publish the live classification, not a round-tripped null",
    );

    let any_clean_carried = events.iter().any(|e| {
        matches!(
            e,
            LaunchTaskEvent::StepFinished {
                status: LaunchTaskStepStatus::Completed | LaunchTaskStepStatus::Cancelled,
                failure_classification: Some(_),
                ..
            }
        )
    });
    assert!(
        !any_clean_carried,
        "non-failure StepFinished events must not carry a classification"
    );

    Ok(())
}

#[tokio::test]
async fn cli_missing_classification_routes_step_and_task_to_failed() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-141-CLI").await?;

    let classification = FailureClassification::CliMissing {
        binary: "claude".into(),
        install_hint: "brew install anthropics/cli/claude".into(),
    };
    let runner = Arc::new(FakeStepRunner::new());
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::FailWith {
            classification: classification.clone(),
        },
    );

    let (exec, bus, _) = build_executor(Arc::clone(&repo), Arc::clone(&runner));
    let mut rx = bus.subscribe();
    exec.run(task.id).await?;

    let reloaded = repo.get(task.id).await?.unwrap();
    assert_eq!(reloaded.status, LaunchTaskStatus::Failed);
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Plan).await,
        LaunchTaskStepStatus::Failed,
        "CliMissing disposition is Failed (terminal), not NeedsHuman",
    );

    let persisted = repo
        .list_steps(task.id)
        .await?
        .into_iter()
        .find(|s| s.step_kind == LaunchStepKind::Plan)
        .expect("planner step exists");
    assert_eq!(
        persisted.failure_classification,
        Some(classification.clone())
    );

    let events = drain_events(&mut rx).await;
    let on_wire = events.iter().find_map(|e| match e {
        LaunchTaskEvent::StepFinished {
            status: LaunchTaskStepStatus::Failed,
            failure_classification,
            ..
        } => Some(failure_classification.clone()),
        _ => None,
    });
    assert_eq!(
        on_wire,
        Some(Some(classification)),
        "SSE event must carry the terminal classification verbatim",
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

    // Wait for the task to reach Running — the executor registers its cancel
    // token synchronously *before* writing this status, so observing Running
    // proves the token is live in the registry without mutating the slot.
    for _ in 0..100 {
        if matches!(
            repo.get(task_id).await?.map(|t| t.status),
            Some(LaunchTaskStatus::Running)
        ) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert_eq!(
        repo.get(task_id).await?.map(|t| t.status),
        Some(LaunchTaskStatus::Running),
        "executor should have moved the task to Running (after registering its cancel token)"
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

    // A live token exists (planner is mid-step), so cancel_or_reserve must
    // signal it rather than reserve an empty slot.
    assert!(
        matches!(
            registry.cancel_or_reserve(task_id),
            CancelDecision::Signalled
        ),
        "cancel must signal a live token"
    );
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

// ── SUP-120 retry ────────────────────────────────────────────────────

#[tokio::test]
async fn retry_from_running_is_rejected_with_invalid_transition() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-RETRY-1").await?;
    repo.update_task_status(task.id, LaunchTaskStatus::Running)
        .await?;

    let runner = Arc::new(FakeStepRunner::new());
    let (exec, _, _) = build_executor(Arc::clone(&repo), Arc::clone(&runner));

    let err = exec.retry_needs_human_step(task.id).await.unwrap_err();
    match err {
        RetryError::Core(CoreError::InvalidLaunchTaskTransition {
            from: LaunchTaskStatus::Running,
            to: LaunchTaskStatus::Running,
        }) => {}
        other => panic!("expected InvalidLaunchTaskTransition, got {other:?}"),
    }
    assert!(
        runner.observed().is_empty(),
        "rejected retry must not invoke the runner"
    );
    Ok(())
}

#[tokio::test]
async fn retry_from_pending_is_rejected_with_invalid_transition() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-RETRY-2").await?;
    // Task starts Pending — retry must refuse before the runner is consulted.

    let runner = Arc::new(FakeStepRunner::new());
    let (exec, _, _) = build_executor(Arc::clone(&repo), Arc::clone(&runner));

    let err = exec.retry_needs_human_step(task.id).await.unwrap_err();
    assert!(matches!(
        err,
        RetryError::Core(CoreError::InvalidLaunchTaskTransition {
            from: LaunchTaskStatus::Pending,
            to: LaunchTaskStatus::Running,
        })
    ));
    assert!(runner.observed().is_empty());
    Ok(())
}

#[tokio::test]
async fn retry_from_terminal_failed_is_rejected() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-RETRY-3").await?;
    repo.update_task_status(task.id, LaunchTaskStatus::Failed)
        .await?;

    let runner = Arc::new(FakeStepRunner::new());
    let (exec, _, _) = build_executor(Arc::clone(&repo), Arc::clone(&runner));

    let err = exec.retry_needs_human_step(task.id).await.unwrap_err();
    assert!(matches!(
        err,
        RetryError::Core(CoreError::InvalidLaunchTaskTransition {
            from: LaunchTaskStatus::Failed,
            to: LaunchTaskStatus::Running,
        })
    ));
    Ok(())
}

#[tokio::test]
async fn retry_after_planner_failure_drives_recipe_to_completed() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-RETRY-4").await?;

    let runner = Arc::new(FakeStepRunner::new());
    // First Plan invocation fails → task moves to NeedsHuman.
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::Fail {
            reason: "first attempt".into(),
        },
    );
    // Second Plan invocation (the retry) and the rest of the recipe succeed.
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::Complete {
            summary: Some("retry plan ok".into()),
        },
    );
    runner.script(
        LaunchStepKind::Implement,
        ScriptedAction::Complete { summary: None },
    );
    runner.script(
        LaunchStepKind::Review,
        ScriptedAction::Complete { summary: None },
    );

    let (exec, bus, _) = build_executor(Arc::clone(&repo), Arc::clone(&runner));

    // Cold-start the task — Plan fails, task ends in NeedsHuman.
    exec.run(task.id).await?;
    let mid = repo.get(task.id).await?.unwrap();
    assert_eq!(mid.status, LaunchTaskStatus::NeedsHuman);

    let mut rx = bus.subscribe();

    // Retry — should re-run Plan, then Implement, then Review.
    let outcome = exec.retry_needs_human_step(task.id).await?;
    assert_eq!(outcome.task_status, LaunchTaskStatus::Completed);

    let reloaded = repo.get(task.id).await?.unwrap();
    assert_eq!(reloaded.status, LaunchTaskStatus::Completed);
    for kind in [
        LaunchStepKind::Plan,
        LaunchStepKind::Implement,
        LaunchStepKind::Review,
    ] {
        assert_eq!(
            step_status(&repo, task.id, kind).await,
            LaunchTaskStepStatus::Completed,
            "{kind:?} should be Completed after retry"
        );
    }
    assert_eq!(
        runner.observed(),
        vec![
            LaunchStepKind::Plan,
            LaunchStepKind::Plan,
            LaunchStepKind::Implement,
            LaunchStepKind::Review,
        ],
        "Plan should be invoked twice (initial + retry), then Implement + Review once each"
    );

    let events = drain_events(&mut rx).await;
    // Expect: TaskStatusChanged(Running) for the retry start, StepStarted(Plan),
    // StepFinished(Plan, Completed), StepStarted(Implement), StepFinished(...),
    // StepStarted(Review), StepFinished(...), TaskStatusChanged(Completed).
    let task_status_events: Vec<&LaunchTaskEvent> = events
        .iter()
        .filter(|e| matches!(e, LaunchTaskEvent::TaskStatusChanged { .. }))
        .collect();
    assert_eq!(
        task_status_events.len(),
        2,
        "expected Running + Completed; got {events:?}"
    );
    Ok(())
}

#[tokio::test]
async fn retry_records_a_new_run_id_distinct_from_the_previous_attempt() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-RETRY-5").await?;

    let first_run_id = RunId::new();
    let retry_run_id = RunId::new();
    assert_ne!(first_run_id, retry_run_id);

    let runner = Arc::new(FakeStepRunner::new());
    // First attempt completes Plan with a run_id link, then fails Implement
    // so the task ends in NeedsHuman pinned on Implement.
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::CompleteWithRun {
            run_id: first_run_id,
        },
    );
    runner.script(
        LaunchStepKind::Implement,
        ScriptedAction::Fail {
            reason: "code didn't compile".into(),
        },
    );
    // Second attempt: Implement now succeeds and records a *new* run id, then
    // Review completes.
    runner.script(
        LaunchStepKind::Implement,
        ScriptedAction::CompleteWithRun {
            run_id: retry_run_id,
        },
    );
    runner.script(
        LaunchStepKind::Review,
        ScriptedAction::Complete { summary: None },
    );

    let (exec, _, _) = build_executor(Arc::clone(&repo), Arc::clone(&runner));

    exec.run(task.id).await?;
    assert_eq!(
        repo.get(task.id).await?.unwrap().status,
        LaunchTaskStatus::NeedsHuman
    );
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Implement).await,
        LaunchTaskStepStatus::NeedsHuman
    );

    let outcome = exec.retry_needs_human_step(task.id).await?;
    assert_eq!(outcome.task_status, LaunchTaskStatus::Completed);
    assert_eq!(
        outcome.new_linked_run_id,
        Some(retry_run_id),
        "retry must surface the run id produced on the new attempt"
    );

    // Implement step now points at the retry run id; the previous link is
    // overwritten by design (see SUP-120 plan, "append-only des liens").
    let steps = repo.list_steps(task.id).await?;
    let implement = steps
        .iter()
        .find(|s| s.step_kind == LaunchStepKind::Implement)
        .unwrap();
    assert_eq!(implement.linked_run_id, Some(retry_run_id));
    assert_eq!(implement.status, LaunchTaskStepStatus::Completed);

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

// ── SUP-191: auto-resume of timed-out steps ──────────────────────────────

#[tokio::test]
async fn timeout_auto_resumes_until_max_then_parks_needs_human() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-191A").await?;

    let runner = Arc::new(FakeStepRunner::new());
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::Complete { summary: None },
    );
    // Each timeout reports a *distinct* diff token (the agent keeps making
    // progress), so only the segment ceiling can stop the loop.
    for (key, token) in [
        ("thread-0", "diff-0"),
        ("thread-1", "diff-1"),
        ("thread-2", "diff-2"),
    ] {
        runner.script(
            LaunchStepKind::Implement,
            ScriptedAction::TimeOut {
                resume_key: Some(key.into()),
                diff_token: token.into(),
            },
        );
    }

    let (exec, _bus, _) = build_executor_with_max(Arc::clone(&repo), Arc::clone(&runner), 2);
    exec.run(task.id).await?;

    // max=2 → initial segment + 2 resumes = 3 runner calls, then park.
    assert_eq!(
        runner.resumes_for(LaunchStepKind::Implement),
        vec![None, Some("thread-0".into()), Some("thread-1".into())],
        "executor resumes with each prior segment's captured thread id"
    );
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Implement).await,
        LaunchTaskStepStatus::NeedsHuman,
        "an exhausted auto-resume budget parks the step at NeedsHuman"
    );
    assert_eq!(
        step_resume_count(&repo, task.id, LaunchStepKind::Implement).await,
        2
    );
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Review).await,
        LaunchTaskStepStatus::Pending,
        "review stays untouched behind the parked implement step"
    );

    let reloaded = repo.get(task.id).await?.unwrap();
    assert_eq!(reloaded.status, LaunchTaskStatus::NeedsHuman);
    let summary = step_summary(&repo, task.id, LaunchStepKind::Implement).await;
    assert!(
        summary.contains("auto-resume budget exhausted after 2×"),
        "park reason names the exhausted budget, got {summary:?}"
    );
    Ok(())
}

#[tokio::test]
async fn timeout_with_no_diff_progress_parks_immediately() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-191B").await?;

    let runner = Arc::new(FakeStepRunner::new());
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::Complete { summary: None },
    );
    // Same diff token twice → the resumed segment produced no new changes.
    runner.script(
        LaunchStepKind::Implement,
        ScriptedAction::TimeOut {
            resume_key: Some("thread-0".into()),
            diff_token: "stuck".into(),
        },
    );
    runner.script(
        LaunchStepKind::Implement,
        ScriptedAction::TimeOut {
            resume_key: Some("thread-1".into()),
            diff_token: "stuck".into(),
        },
    );

    let (exec, _bus, _) = build_executor_with_max(Arc::clone(&repo), Arc::clone(&runner), 5);
    exec.run(task.id).await?;

    // Resumed once (count=1), then the diff gate stopped it before exhausting 5.
    assert_eq!(
        runner.resumes_for(LaunchStepKind::Implement),
        vec![None, Some("thread-0".into())],
        "the no-progress gate halts the loop after a single resume"
    );
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Implement).await,
        LaunchTaskStepStatus::NeedsHuman,
    );
    assert_eq!(
        step_resume_count(&repo, task.id, LaunchStepKind::Implement).await,
        1
    );
    let summary = step_summary(&repo, task.id, LaunchStepKind::Implement).await;
    assert!(
        summary.contains("no new changes"),
        "park reason names the no-progress gate, got {summary:?}"
    );
    Ok(())
}

#[tokio::test]
async fn timeout_without_resume_key_parks_immediately() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-191C").await?;

    let runner = Arc::new(FakeStepRunner::new());
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::Complete { summary: None },
    );
    runner.script(
        LaunchStepKind::Implement,
        ScriptedAction::TimeOut {
            resume_key: None,
            diff_token: "diff-0".into(),
        },
    );

    let (exec, _bus, _) = build_executor_with_max(Arc::clone(&repo), Arc::clone(&runner), 3);
    exec.run(task.id).await?;

    // No resume key → no resume attempt at all, immediate park (never a silent fresh run).
    assert_eq!(
        runner.resumes_for(LaunchStepKind::Implement),
        vec![None],
        "a missing resume key parks without ever resuming"
    );
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Implement).await,
        LaunchTaskStepStatus::NeedsHuman,
    );
    assert_eq!(
        step_resume_count(&repo, task.id, LaunchStepKind::Implement).await,
        0
    );
    let summary = step_summary(&repo, task.id, LaunchStepKind::Implement).await;
    assert!(
        summary.contains("no resumable"),
        "park reason names the missing resume key, got {summary:?}"
    );
    Ok(())
}

#[tokio::test]
async fn timeout_then_resume_completes_and_continues_recipe() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-191D").await?;

    let runner = Arc::new(FakeStepRunner::new());
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::Complete { summary: None },
    );
    // First segment times out, the resumed segment finishes the work.
    runner.script(
        LaunchStepKind::Implement,
        ScriptedAction::TimeOut {
            resume_key: Some("thread-0".into()),
            diff_token: "diff-0".into(),
        },
    );
    runner.script(
        LaunchStepKind::Implement,
        ScriptedAction::Complete {
            summary: Some("implemented after resume".into()),
        },
    );
    runner.script(
        LaunchStepKind::Review,
        ScriptedAction::Complete { summary: None },
    );

    let (exec, _bus, _) = build_executor_with_max(Arc::clone(&repo), Arc::clone(&runner), 3);
    exec.run(task.id).await?;

    assert_eq!(
        runner.resumes_for(LaunchStepKind::Implement),
        vec![None, Some("thread-0".into())],
        "the second implement call resumes the captured thread"
    );
    let reloaded = repo.get(task.id).await?.unwrap();
    assert_eq!(
        reloaded.status,
        LaunchTaskStatus::Completed,
        "a successful resume lets the recipe run to completion"
    );
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Implement).await,
        LaunchTaskStepStatus::Completed,
    );
    Ok(())
}

#[tokio::test]
async fn manual_retry_resumes_the_persisted_session() -> Result<()> {
    let repo = fresh_repo().await?;
    let (task, _) = create_task(&repo, "TEAM-191E").await?;

    let runner = Arc::new(FakeStepRunner::new());
    runner.script(
        LaunchStepKind::Plan,
        ScriptedAction::Complete { summary: None },
    );
    // Exhaust the budget (max=1): initial segment + 1 resume, then park with
    // the last thread id ("thread-1") persisted on the step row.
    runner.script(
        LaunchStepKind::Implement,
        ScriptedAction::TimeOut {
            resume_key: Some("thread-0".into()),
            diff_token: "diff-0".into(),
        },
    );
    runner.script(
        LaunchStepKind::Implement,
        ScriptedAction::TimeOut {
            resume_key: Some("thread-1".into()),
            diff_token: "diff-1".into(),
        },
    );

    let (exec, _bus, _) = build_executor_with_max(Arc::clone(&repo), Arc::clone(&runner), 1);
    exec.run(task.id).await?;
    assert_eq!(
        step_status(&repo, task.id, LaunchStepKind::Implement).await,
        LaunchTaskStepStatus::NeedsHuman,
    );

    // Operator retry: the parked step's persisted resume key ("thread-1") is
    // resumed, and this time the agent finishes — the recipe continues.
    runner.script(
        LaunchStepKind::Implement,
        ScriptedAction::Complete {
            summary: Some("done on manual retry".into()),
        },
    );
    runner.script(
        LaunchStepKind::Review,
        ScriptedAction::Complete { summary: None },
    );

    let outcome = exec.retry_needs_human_step(task.id).await?;
    assert_eq!(outcome.task_status, LaunchTaskStatus::Completed);

    // The first call after the retry resumed the persisted thread, not a fresh run.
    let implement_resumes = runner.resumes_for(LaunchStepKind::Implement);
    assert_eq!(
        implement_resumes.last(),
        Some(&Some("thread-1".into())),
        "manual retry resumes the persisted session; full sequence: {implement_resumes:?}"
    );
    Ok(())
}
