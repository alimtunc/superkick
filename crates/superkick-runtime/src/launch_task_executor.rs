//! Sequential executor for `LaunchTask` aggregates (SUP-118).
//!
//! The executor drives a `LaunchTask` through its ordered steps using a
//! pluggable `StepRunner`. The split between the executor (control plane:
//! transitions, registry, bus) and the runner (substrate: how a single step
//! actually runs) is deliberate:
//!
//! * Tests inject a deterministic `FakeStepRunner` so the loop is unit-testable
//!   without standing up a real process supervisor.
//! * Production wires `StubStepRunner` in V1 — see its docstring for why
//!   `Orchestrator::spawn` integration is deferred.
//!
//! The V1 failure policy is explicit and intentional:
//!
//! * Plan / Implement / Review failure → `LaunchTask = NeedsHuman`, the
//!   failing step in `Failed`, every later step left untouched in `Pending`.
//! * No implicit retry. No auto-merge. No mutation of Linear from inside
//!   this loop.
//!
//! Cancellation propagates through the registry-supplied `CancellationToken`:
//! the runner observes it for in-flight aborts, the loop checks it between
//! steps so a cancel arriving between transitions still terminates promptly.

use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result, anyhow};
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

use superkick_core::{
    ConversationId, LaunchTask, LaunchTaskId, LaunchTaskStatus, LaunchTaskStep,
    LaunchTaskStepStatus, OrchestratorSessionId, RunId,
};
use superkick_storage::repo::LaunchTaskRepo;

use crate::launch_task_event_bus::{LaunchTaskEvent, LaunchTaskEventBus};
use crate::launch_task_registry::LaunchTaskRegistry;

/// Substrate links recorded on a step once the runner has spawned (or
/// attached to) the underlying execution. Each `Some` is appended via
/// `LaunchTaskRepo::add_step_links`; `None` leaves the column unchanged.
#[derive(Debug, Clone, Default)]
pub struct StepLinks {
    pub run_id: Option<RunId>,
    pub conversation_id: Option<ConversationId>,
    pub orchestrator_session_id: Option<OrchestratorSessionId>,
}

/// Outcome of a single step from the runner's point of view. The executor
/// translates these into persisted state transitions.
#[derive(Debug)]
pub enum StepOutcome {
    Completed {
        summary: Option<String>,
        links: StepLinks,
    },
    Failed {
        reason: String,
    },
    Cancelled,
}

/// Pluggable substrate for executing one step. Tests stub this to drive the
/// executor deterministically; production injects `StubStepRunner` until the
/// real `Orchestrator::spawn` wiring lands (see `StubStepRunner` docstring).
///
/// The runner is **expected** to honour `cancel`: when the token fires the
/// implementation should propagate cancellation to its substrate (e.g.
/// `Orchestrator::cancel`) and return `StepOutcome::Cancelled` promptly so the
/// executor can finalise the launch task in a timely manner.
pub trait StepRunner: Send + Sync + 'static {
    fn run_step(
        &self,
        task: &LaunchTask,
        step: &LaunchTaskStep,
        cancel: CancellationToken,
    ) -> impl Future<Output = Result<StepOutcome>> + Send;
}

/// V1 production runner. **Does not yet spawn a real agent process.**
///
/// Plumbing the executor through `Orchestrator::spawn` requires a `RunId` +
/// `RunStepId` for the resulting `agent_sessions` row (FK-enforced), which in
/// turn forces the launch-task loop to either (a) create a parallel `Run`
/// per step — polluting the runs/queue/dashboard surfaces — or (b) refactor
/// `agent_supervisor` to accept spawn requests without an owning run. Both
/// are larger than SUP-118 and tracked as a follow-up.
///
/// Until that lands, this stub honours `cancel`, sleeps briefly so the bus
/// emits observable transitions, and reports the step as `Completed` with a
/// summary tagged `[V1 stub]` so operators understand no real work happened.
pub struct StubStepRunner;

impl StubStepRunner {
    pub fn new() -> Self {
        Self
    }
}

impl Default for StubStepRunner {
    fn default() -> Self {
        Self::new()
    }
}

impl StepRunner for StubStepRunner {
    async fn run_step(
        &self,
        task: &LaunchTask,
        step: &LaunchTaskStep,
        cancel: CancellationToken,
    ) -> Result<StepOutcome> {
        warn!(
            task_id = %task.id,
            step_id = %step.id,
            step_kind = %step.step_kind,
            agent = %step.agent_name,
            "StubStepRunner: V1 stub — no real agent spawn yet (Orchestrator integration is a follow-up)"
        );

        tokio::select! {
            _ = tokio::time::sleep(Duration::from_millis(50)) => {}
            _ = cancel.cancelled() => return Ok(StepOutcome::Cancelled),
        }

        Ok(StepOutcome::Completed {
            summary: Some(format!("[V1 stub] {} step completed", step.step_kind)),
            links: StepLinks::default(),
        })
    }
}

/// Drives a `LaunchTask` from `Pending` through its three steps to a terminal
/// state. Holds shared dependencies; cheap to clone via `Arc`.
pub struct LaunchTaskExecutor<R, S>
where
    R: LaunchTaskRepo + 'static,
    S: StepRunner,
{
    repo: Arc<R>,
    bus: Arc<LaunchTaskEventBus>,
    registry: Arc<LaunchTaskRegistry>,
    step_runner: Arc<S>,
}

impl<R, S> LaunchTaskExecutor<R, S>
where
    R: LaunchTaskRepo + 'static,
    S: StepRunner,
{
    pub fn new(
        repo: Arc<R>,
        bus: Arc<LaunchTaskEventBus>,
        registry: Arc<LaunchTaskRegistry>,
        step_runner: Arc<S>,
    ) -> Arc<Self> {
        Arc::new(Self {
            repo,
            bus,
            registry,
            step_runner,
        })
    }

    pub fn bus(&self) -> Arc<LaunchTaskEventBus> {
        Arc::clone(&self.bus)
    }

    pub fn registry(&self) -> Arc<LaunchTaskRegistry> {
        Arc::clone(&self.registry)
    }

    /// Detach `run` onto a `tokio::spawn` task and log the error path. The
    /// returned `JoinHandle` is intentionally `()` — failures are logged
    /// inside the spawned task because the auto-trigger caller (the HTTP
    /// `POST /launch-tasks` handler) cannot meaningfully await the executor.
    /// Returning the handle lets a future supervisor drain in-flight tasks
    /// at shutdown without changing the call sites.
    pub fn spawn(self: Arc<Self>, task_id: LaunchTaskId) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            if let Err(e) = self.run(task_id).await {
                tracing::error!(%task_id, error = %e, "launch task executor failed");
            }
        })
    }

    /// Cancel a launch task whose execution does not live in this process —
    /// either an orphan after a server restart, or a task that was never
    /// auto-started. Persists the `Cancelled` status and publishes the
    /// matching `TaskStatusChanged` event through the same code path the
    /// in-process loop uses, so SSE consumers see the transition.
    ///
    /// Returns:
    /// - `Ok(None)` if the task does not exist.
    /// - `Ok(Some(status))` with the row's actual current status. For tasks
    ///   that were already terminal, no row write or event is emitted and
    ///   the existing status is returned (idempotent). For non-terminal
    ///   tasks, the status is `Cancelled` after a successful write.
    pub async fn cancel_orphan(&self, task_id: LaunchTaskId) -> Result<Option<LaunchTaskStatus>> {
        let Some(task) = self.repo.get(task_id).await? else {
            return Ok(None);
        };
        if task.status.is_terminal() {
            return Ok(Some(task.status));
        }
        self.move_task_to_cancelled(&task, None).await?;
        Ok(Some(LaunchTaskStatus::Cancelled))
    }

    /// Execute a launch task to a terminal state. Idempotent for already-
    /// terminal tasks (returns `Ok(())` without touching the row). Re-entry
    /// while a previous execution is still live in this process is rejected
    /// up front so the registry never overwrites a token an SSE consumer
    /// might still be racing against.
    ///
    /// The registry entry is removed via a `Drop` guard so a panic anywhere
    /// inside `run_inner` (including in the step runner) cannot leak the
    /// token — a leaked token would make subsequent `cancel` calls return
    /// `signalled: true` while no executor is alive.
    pub async fn run(&self, task_id: LaunchTaskId) -> Result<()> {
        let cancel = CancellationToken::new();
        if self.registry.register(task_id, cancel.clone()).is_some() {
            return Err(anyhow!(
                "launch task {task_id} already has a live executor in this process"
            ));
        }
        let _guard = RegistryGuard {
            registry: Arc::clone(&self.registry),
            task_id,
        };
        self.run_inner(task_id, cancel).await
    }

    async fn run_inner(&self, task_id: LaunchTaskId, cancel: CancellationToken) -> Result<()> {
        let task = self
            .repo
            .get(task_id)
            .await?
            .ok_or_else(|| anyhow!("launch task {task_id} not found"))?;

        if task.status.is_terminal() {
            return Ok(());
        }

        let mut steps = self.repo.list_steps(task_id).await?;
        steps.sort_by_key(|s| s.sequence);

        // Pending → Running. This is the only valid entry transition; if
        // somebody else moved the task out of Pending while we were loading,
        // surface the conflict and bail.
        if matches!(task.status, LaunchTaskStatus::Pending) {
            self.repo
                .update_task_status(task.id, LaunchTaskStatus::Running)
                .await
                .with_context(|| format!("launch_task {task_id} → Running"))?;
            self.publish(LaunchTaskEvent::TaskStatusChanged {
                task_id: task.id,
                linear_issue_id: task.linear_issue_id.clone(),
                status: LaunchTaskStatus::Running,
                current_step_id: None,
                reason: None,
            });
        } else if !matches!(task.status, LaunchTaskStatus::Running) {
            // NeedsHuman/etc. resume is out of V1 scope — refuse cleanly.
            return Err(anyhow!(
                "launch task {task_id} is in {} — only Pending tasks can be executed",
                task.status
            ));
        }

        for step in &steps {
            if step.status.is_terminal() {
                continue;
            }
            if !matches!(step.status, LaunchTaskStepStatus::Pending) {
                // Running orphan from a prior process (crash recovery hors
                // scope V1). Fail-safe: NeedsHuman with a clear reason, no
                // implicit transition on the orphan step.
                let reason = format!(
                    "step {} is in {} — orphaned from a previous execution; \
                     crash recovery is not implemented in V1",
                    step.id, step.status
                );
                self.move_task_to_needs_human(&task, Some(step.id), reason)
                    .await?;
                return Ok(());
            }

            if cancel.is_cancelled() {
                self.move_task_to_cancelled(&task, None).await?;
                return Ok(());
            }

            self.repo.set_current_step(task.id, Some(step.id)).await?;
            self.repo
                .update_step_status(step.id, LaunchTaskStepStatus::Running)
                .await
                .with_context(|| format!("step {} → Running", step.id))?;
            self.publish(LaunchTaskEvent::StepStarted {
                task_id: task.id,
                linear_issue_id: task.linear_issue_id.clone(),
                step_id: step.id,
                step_kind: step.step_kind,
                agent_name: step.agent_name.clone(),
                sequence: step.sequence,
            });

            let runner_result = self.step_runner.run_step(&task, step, cancel.clone()).await;

            match runner_result {
                Ok(StepOutcome::Completed { summary, links }) => {
                    self.repo
                        .add_step_links(
                            step.id,
                            links.run_id,
                            links.conversation_id,
                            links.orchestrator_session_id,
                        )
                        .await
                        .with_context(|| format!("step {} link recording", step.id))?;
                    self.repo
                        .update_step_status(step.id, LaunchTaskStepStatus::Completed)
                        .await
                        .with_context(|| format!("step {} → Completed", step.id))?;
                    self.publish(LaunchTaskEvent::StepFinished {
                        task_id: task.id,
                        linear_issue_id: task.linear_issue_id.clone(),
                        step_id: step.id,
                        step_kind: step.step_kind,
                        status: LaunchTaskStepStatus::Completed,
                        summary,
                    });
                }
                Ok(StepOutcome::Failed { reason }) => {
                    self.fail_step(&task, step, reason.clone()).await?;
                    self.move_task_to_needs_human(&task, Some(step.id), reason)
                        .await?;
                    return Ok(());
                }
                Ok(StepOutcome::Cancelled) => {
                    self.cancel_step(&task, step).await?;
                    self.move_task_to_cancelled(&task, Some(step.id)).await?;
                    return Ok(());
                }
                Err(e) => {
                    let reason = format!("step runner error: {e:#}");
                    self.fail_step(&task, step, reason.clone()).await?;
                    self.move_task_to_needs_human(&task, Some(step.id), reason)
                        .await?;
                    return Ok(());
                }
            }
        }

        // All steps completed.
        self.repo.set_current_step(task.id, None).await?;
        self.repo
            .update_task_status(task.id, LaunchTaskStatus::Completed)
            .await
            .with_context(|| format!("launch_task {task_id} → Completed"))?;
        self.publish(LaunchTaskEvent::TaskStatusChanged {
            task_id: task.id,
            linear_issue_id: task.linear_issue_id.clone(),
            status: LaunchTaskStatus::Completed,
            current_step_id: None,
            reason: None,
        });
        info!(task_id = %task.id, "launch task completed");
        Ok(())
    }

    async fn fail_step(
        &self,
        task: &LaunchTask,
        step: &LaunchTaskStep,
        reason: String,
    ) -> Result<()> {
        self.repo
            .update_step_status(step.id, LaunchTaskStepStatus::Failed)
            .await
            .with_context(|| format!("step {} → Failed", step.id))?;
        self.publish(LaunchTaskEvent::StepFinished {
            task_id: task.id,
            linear_issue_id: task.linear_issue_id.clone(),
            step_id: step.id,
            step_kind: step.step_kind,
            status: LaunchTaskStepStatus::Failed,
            summary: Some(reason),
        });
        Ok(())
    }

    async fn cancel_step(&self, task: &LaunchTask, step: &LaunchTaskStep) -> Result<()> {
        self.repo
            .update_step_status(step.id, LaunchTaskStepStatus::Cancelled)
            .await
            .with_context(|| format!("step {} → Cancelled", step.id))?;
        self.publish(LaunchTaskEvent::StepFinished {
            task_id: task.id,
            linear_issue_id: task.linear_issue_id.clone(),
            step_id: step.id,
            step_kind: step.step_kind,
            status: LaunchTaskStepStatus::Cancelled,
            summary: None,
        });
        Ok(())
    }

    async fn move_task_to_needs_human(
        &self,
        task: &LaunchTask,
        step_id: Option<superkick_core::LaunchTaskStepId>,
        reason: String,
    ) -> Result<()> {
        self.repo
            .update_task_status(task.id, LaunchTaskStatus::NeedsHuman)
            .await
            .with_context(|| format!("launch_task {} → NeedsHuman", task.id))?;
        self.publish(LaunchTaskEvent::TaskStatusChanged {
            task_id: task.id,
            linear_issue_id: task.linear_issue_id.clone(),
            status: LaunchTaskStatus::NeedsHuman,
            current_step_id: step_id,
            reason: Some(reason),
        });
        Ok(())
    }

    async fn move_task_to_cancelled(
        &self,
        task: &LaunchTask,
        step_id: Option<superkick_core::LaunchTaskStepId>,
    ) -> Result<()> {
        self.repo
            .update_task_status(task.id, LaunchTaskStatus::Cancelled)
            .await
            .with_context(|| format!("launch_task {} → Cancelled", task.id))?;
        self.publish(LaunchTaskEvent::TaskStatusChanged {
            task_id: task.id,
            linear_issue_id: task.linear_issue_id.clone(),
            status: LaunchTaskStatus::Cancelled,
            current_step_id: step_id,
            reason: None,
        });
        Ok(())
    }

    fn publish(&self, event: LaunchTaskEvent) {
        self.bus.publish(event);
    }
}

/// RAII guard that removes a launch task's cancellation token from the
/// registry on drop, including in the panic-unwind case. See
/// `LaunchTaskExecutor::run` for the leak it prevents.
struct RegistryGuard {
    registry: Arc<LaunchTaskRegistry>,
    task_id: LaunchTaskId,
}

impl Drop for RegistryGuard {
    fn drop(&mut self) {
        self.registry.unregister(self.task_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    /// Minimal fake — counts calls and returns a fixed outcome. Useful for
    /// the unit tests in this module; integration tests in `tests/` use
    /// richer fakes that script per-step behaviour.
    struct CountingRunner {
        calls: AtomicUsize,
    }

    impl StepRunner for CountingRunner {
        async fn run_step(
            &self,
            _task: &LaunchTask,
            step: &LaunchTaskStep,
            _cancel: CancellationToken,
        ) -> Result<StepOutcome> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(StepOutcome::Completed {
                summary: Some(format!("ok {}", step.step_kind)),
                links: StepLinks::default(),
            })
        }
    }

    #[tokio::test]
    async fn stub_runner_returns_completed_with_v1_summary() {
        use chrono::Utc;
        use superkick_core::{LaunchRecipe, LaunchStepKind, LaunchTaskStepId};

        let task = LaunchTask {
            id: LaunchTaskId::new(),
            linear_issue_id: "TEAM-1".into(),
            recipe_kind: LaunchRecipe::PlanImplementReview,
            status: LaunchTaskStatus::Pending,
            current_step_id: None,
            summary: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let step = LaunchTaskStep {
            id: LaunchTaskStepId::new(),
            launch_task_id: task.id,
            sequence: 1,
            step_kind: LaunchStepKind::Plan,
            agent_name: "planner".into(),
            provider: None,
            model: None,
            mode: None,
            status: LaunchTaskStepStatus::Pending,
            linked_run_id: None,
            linked_conversation_id: None,
            linked_orchestrator_session_id: None,
            summary: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let outcome = StubStepRunner::new()
            .run_step(&task, &step, CancellationToken::new())
            .await
            .expect("stub runner must not error");
        match outcome {
            StepOutcome::Completed { summary, .. } => {
                assert!(summary.unwrap().contains("V1 stub"));
            }
            other => panic!("expected Completed, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn counting_runner_compiles_against_trait() {
        // Compile-only: ensures the trait + generic bounds line up.
        let _ = CountingRunner {
            calls: AtomicUsize::new(0),
        };
    }
}
