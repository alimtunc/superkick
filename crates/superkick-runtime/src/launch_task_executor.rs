//! Sequential executor for `LaunchTask` aggregates (SUP-118).
//!
//! The executor drives a `LaunchTask` through its ordered steps using a
//! pluggable `StepRunner`. The split between the executor (control plane:
//! transitions, registry, bus) and the runner (substrate: how a single step
//! actually runs) is deliberate:
//!
//! * Tests inject a deterministic `FakeStepRunner` so the loop is unit-testable
//!   without standing up a real process supervisor.
//! * Production wires `RealStepRunner` (SUP-124) — it spawns the agent
//!   process for each Plan/Implement/Review step via `AgentSupervisor::launch`
//!   under a synthetic "shadow" `Run` that provides the FK pair
//!   `agent_sessions` requires.
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
    ConversationId, CoreError, FailureClassification, FailureDisposition, LaunchTask, LaunchTaskId,
    LaunchTaskStatus, LaunchTaskStep, LaunchTaskStepId, LaunchTaskStepStatus, MemoryEntryId,
    OrchestratorSessionId, ResumeKey, RetryPath, Run, RunId, RunState, StepExecutor,
};
use superkick_storage::repo::LaunchTaskRepo;

use crate::launch_task_event_bus::{LaunchTaskEvent, LaunchTaskEventBus};
use crate::launch_task_registry::{CancelDecision, LaunchTaskRegistry};
use crate::step_failure_classifier::DiffSnapshot;

/// Fallback auto-resume ceiling used by [`LaunchTaskExecutor::new`] when the
/// caller does not thread one in from `budget.max_auto_resumes` (SUP-191).
/// Mirrors `superkick_config::BudgetConfig`'s default so test executors built
/// via `new` behave like production.
pub const DEFAULT_MAX_AUTO_RESUMES: u32 = 3;

/// Substrate links recorded on a step once the runner has spawned (or
/// attached to) the underlying execution. Each `Some` is appended via
/// `LaunchTaskRepo::add_step_links`; `None` leaves the column unchanged.
#[derive(Debug, Clone, Default)]
pub struct StepLinks {
    pub run_id: Option<RunId>,
    pub conversation_id: Option<ConversationId>,
    pub orchestrator_session_id: Option<OrchestratorSessionId>,
}

/// API layer maps `Core` → 409, `NotFound` → 404, `Other` → 500.
#[derive(Debug, thiserror::Error)]
pub enum RetryError {
    #[error("launch task {0} not found")]
    NotFound(LaunchTaskId),
    #[error(transparent)]
    Core(#[from] CoreError),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

#[derive(Debug)]
pub struct CancelOutcome {
    pub status: LaunchTaskStatus,
    /// `true` when a live executor was signalled; `false` for orphan / terminal.
    pub signalled: bool,
}

/// SUP-120 — observable result of `retry_needs_human_step`. The HTTP layer
/// projects this onto a JSON response so the operator sees the new run/conv
/// link without having to refetch the step list.
#[derive(Debug)]
pub struct RetryOutcome {
    /// Status of the launch task after the retry has finished driving the
    /// recipe — `Running` (a later step is still in flight is impossible
    /// because we await each step), `Completed`, `NeedsHuman`, `Failed`, or
    /// `Cancelled`.
    pub task_status: LaunchTaskStatus,
    /// The step the operator asked us to retry (whatever was in
    /// `current_step_id` when the retry began).
    pub retried_step_id: LaunchTaskStepId,
    /// New run id linked to the retried step by the runner, when one was
    /// produced. SUP-124's `RealStepRunner` populates this with the synthetic
    /// shadow run id; the test stub leaves it `None`.
    pub new_linked_run_id: Option<RunId>,
}

/// Outcome of a single step from the runner's point of view. The executor
/// translates these into persisted state transitions.
///
/// `NeedsHuman` and `Failed` both carry the runtime classifier verdict
/// ([`FailureClassification`]) so the executor can branch on disposition
/// (retryable vs. terminal) and the storage layer can persist the typed
/// reason on the step row.
#[derive(Debug)]
pub enum StepOutcome {
    Completed {
        summary: Option<String>,
        links: StepLinks,
        /// Empty for stub/fallback runners and for skipped writes so existing
        /// payloads stay stable.
        memory_entry_ids: Vec<MemoryEntryId>,
    },
    /// Retryable failure — the executor parks the step at `NeedsHuman` so
    /// SUP-120's `retry_needs_human_step` can re-enter it.
    NeedsHuman {
        classification: FailureClassification,
        links: StepLinks,
    },
    /// SUP-191 — the step's turn hit its wall-clock budget mid-work. The
    /// executor runs the auto-resume loop on this outcome: it compares the
    /// `diff_snapshot` against the previous segment and, if there is progress,
    /// a `resume_key`, and budget left, resumes the Codex session; otherwise
    /// it parks the step at `NeedsHuman`. `resume_key` is `None` when no
    /// resumable session id was captured (e.g. PTY path or a pre-`SessionMeta`
    /// crash), which forces an immediate park.
    TimedOut {
        classification: FailureClassification,
        links: StepLinks,
        resume_key: Option<ResumeKey>,
        diff_snapshot: DiffSnapshot,
    },
    /// Terminal failure — the executor flips both step and task to
    /// `Failed`. No in-place retry; recovery requires a fresh task.
    Failed {
        classification: FailureClassification,
        links: StepLinks,
    },
    Cancelled,
}

/// Terminal state to drive a shadow `Run` to when its owning `LaunchTask` dies,
/// mirroring the task's own outcome so the run stops blocking relaunch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShadowRunTerminal {
    Failed,
    Cancelled,
    Completed,
}

impl ShadowRunTerminal {
    pub(crate) fn to_run_state(self) -> RunState {
        match self {
            ShadowRunTerminal::Failed => RunState::Failed,
            ShadowRunTerminal::Cancelled => RunState::Cancelled,
            ShadowRunTerminal::Completed => RunState::Completed,
        }
    }

    /// The shadow terminal mirroring an already-terminal task status; `None` for non-terminal ones.
    pub(crate) fn matching(task_status: LaunchTaskStatus) -> Option<Self> {
        match task_status {
            LaunchTaskStatus::Failed => Some(ShadowRunTerminal::Failed),
            LaunchTaskStatus::Cancelled => Some(ShadowRunTerminal::Cancelled),
            LaunchTaskStatus::Completed => Some(ShadowRunTerminal::Completed),
            LaunchTaskStatus::Pending
            | LaunchTaskStatus::Running
            | LaunchTaskStatus::NeedsHuman => None,
        }
    }
}

/// What a single [`LaunchTaskExecutor::reconcile_shadow_run`] decision did,
/// aggregated by the liveness pass for an operator-facing summary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReconcileOutcome {
    /// Run was already terminal — nothing to do.
    AlreadyTerminal,
    /// Owning task is `NeedsHuman` (retryable park) — left untouched.
    SkippedParked,
    /// A live executor still owns the task — left untouched (periodic sweep).
    SkippedAlive,
    /// Owning task was active with no live executor — driven terminal (Failed).
    OrphanReconciled,
    /// Owning task already terminal but its shadow run was stranded — finalized.
    StrandReconciled,
    /// Shadow run with no resolvable owning task — finalized to Failed.
    OrphanRunReconciled,
}

/// Why a timed-out step's auto-resume loop gave up and parked it (SUP-191).
/// Drives the operator-facing reason appended to the step summary.
#[derive(Debug, Clone, Copy)]
enum TimeoutParkReason {
    /// Spent the full `max_auto_resumes` budget without the step finishing.
    Exhausted,
    /// The last resumed segment produced no new diff — the agent is stuck.
    NoProgress,
    /// No Codex resume key was captured, so the session cannot be continued.
    NoResumeKey,
}

/// Outcome of the three-gate decision for a timed-out segment (SUP-191):
/// continue the Codex session or park the step.
enum ResumeDecision {
    Resume(ResumeKey),
    Park {
        reason: TimeoutParkReason,
        resume_key: Option<ResumeKey>,
    },
}

/// Decide whether a timed-out segment may resume. A resume requires **all
/// three** gates: budget remaining, the worktree diff moved since the previous
/// segment, and a resume key was captured. The diff gate is what makes the
/// retry safe — a stuck agent parks instead of burning the full budget. Pure
/// so the gate logic is unit-testable without the async executor (SUP-191).
fn decide_resume(
    segments_used: u32,
    max_auto_resumes: u32,
    prev_diff: Option<&DiffSnapshot>,
    diff_snapshot: &DiffSnapshot,
    resume_key: Option<ResumeKey>,
) -> ResumeDecision {
    if segments_used >= max_auto_resumes {
        return ResumeDecision::Park {
            reason: TimeoutParkReason::Exhausted,
            resume_key,
        };
    }
    if prev_diff.is_some_and(|prev| prev.same_as(diff_snapshot)) {
        return ResumeDecision::Park {
            reason: TimeoutParkReason::NoProgress,
            resume_key,
        };
    }
    match resume_key {
        Some(key) => ResumeDecision::Resume(key),
        None => ResumeDecision::Park {
            reason: TimeoutParkReason::NoResumeKey,
            resume_key: None,
        },
    }
}

/// Pluggable substrate for executing one step. Tests stub this to drive the
/// executor deterministically; production injects `RealStepRunner` (SUP-124),
/// which spawns the agent process for each step via `AgentSupervisor::launch`
/// under a synthetic shadow `Run`.
///
/// The runner is **expected** to honour `cancel`: when the token fires the
/// implementation should propagate cancellation to its substrate (e.g.
/// `AgentHandle::cancel`) and return `StepOutcome::Cancelled` promptly so the
/// executor can finalise the launch task in a timely manner.
pub trait StepRunner: Send + Sync + 'static {
    /// Run (or resume) one step. `resume` carries the Codex `thread_id` from a
    /// prior timed-out segment (SUP-191): `Some` continues that session via
    /// `codex exec resume`, `None` starts fresh. Runners that have no resumable
    /// substrate (the stub, non-Codex paths) ignore it.
    fn run_step(
        &self,
        task: &LaunchTask,
        step: &LaunchTaskStep,
        resume: Option<ResumeKey>,
        cancel: CancellationToken,
    ) -> impl Future<Output = Result<StepOutcome>> + Send;

    /// Drive the shadow `Run` (plus its still-running steps and sessions)
    /// backing `run_id` to a terminal state, emitting a ledger event. Idempotent.
    /// This lets the executor (sole owner of task/step transitions) terminalize
    /// the runner-owned shadow run without becoming a second `RunState` writer.
    /// The default no-op keeps test fakes with no real shadow run unaffected.
    fn finalize_shadow_run(
        &self,
        _run_id: RunId,
        _terminal: ShadowRunTerminal,
        _reason: &str,
    ) -> impl Future<Output = Result<()>> + Send {
        async { Ok(()) }
    }
}

/// V1 stub runner — **test-only**.
///
/// Historically wired into production while the FK arbitration for
/// `agent_sessions` was unresolved. SUP-124 picked option (a) from the
/// original docstring (a shadow `Run` per Launch Task) and `RealStepRunner`
/// became the production substrate. The stub stays around so HTTP-shape
/// tests and the unit tests in this module can drive the loop without
/// spawning real agent processes.
///
/// Honours `cancel`, sleeps briefly so the bus emits observable transitions,
/// and reports the step as `Completed` with a summary tagged `[V1 stub]`.
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
        _resume: Option<ResumeKey>,
        cancel: CancellationToken,
    ) -> Result<StepOutcome> {
        warn!(
            task_id = %task.id,
            step_id = %step.id,
            step_kind = %step.step_kind,
            agent = %step.agent_name,
            "StubStepRunner: stub runner — no real agent spawn"
        );

        tokio::select! {
            _ = tokio::time::sleep(Duration::from_millis(50)) => {}
            _ = cancel.cancelled() => return Ok(StepOutcome::Cancelled),
        }

        Ok(StepOutcome::Completed {
            summary: Some(format!("[V1 stub] {} step completed", step.step_kind)),
            links: StepLinks::default(),
            memory_entry_ids: Vec::new(),
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
    /// Max automatic resume attempts per timed-out step (SUP-191). Threaded
    /// from `budget.max_auto_resumes` by production wiring.
    max_auto_resumes: u32,
}

impl<R, S> LaunchTaskExecutor<R, S>
where
    R: LaunchTaskRepo + 'static,
    S: StepRunner,
{
    /// Build an executor with the default auto-resume ceiling
    /// ([`DEFAULT_MAX_AUTO_RESUMES`]). Production wiring uses
    /// [`Self::with_max_auto_resumes`] to inject `budget.max_auto_resumes`.
    pub fn new(
        repo: Arc<R>,
        bus: Arc<LaunchTaskEventBus>,
        registry: Arc<LaunchTaskRegistry>,
        step_runner: Arc<S>,
    ) -> Arc<Self> {
        Self::with_max_auto_resumes(repo, bus, registry, step_runner, DEFAULT_MAX_AUTO_RESUMES)
    }

    /// Build an executor with an explicit auto-resume ceiling (SUP-191).
    pub fn with_max_auto_resumes(
        repo: Arc<R>,
        bus: Arc<LaunchTaskEventBus>,
        registry: Arc<LaunchTaskRegistry>,
        step_runner: Arc<S>,
        max_auto_resumes: u32,
    ) -> Arc<Self> {
        Arc::new(Self {
            repo,
            bus,
            registry,
            step_runner,
            max_auto_resumes,
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

    /// Signal-or-reserve under a single registry lock so a concurrent
    /// `run`/`retry` cannot slip a fresh executor between probe and write.
    pub async fn cancel(&self, task_id: LaunchTaskId) -> Result<Option<CancelOutcome>> {
        match self.registry.cancel_or_reserve(task_id) {
            CancelDecision::Signalled => {
                let Some(task) = self.repo.get(task_id).await? else {
                    return Ok(None);
                };
                Ok(Some(CancelOutcome {
                    status: task.status,
                    signalled: true,
                }))
            }
            CancelDecision::Reserved(_guard) => {
                let Some(task) = self.repo.get(task_id).await? else {
                    return Ok(None);
                };
                if task.status.is_terminal() {
                    return Ok(Some(CancelOutcome {
                        status: task.status,
                        signalled: false,
                    }));
                }
                // No live executor (Reserved) means the in-process step-runner
                // cancel arm never ran. Cancel any still-active step too — a
                // parked step left at `needs_human` keeps the UI's needs-you
                // banner up (blocking is step-driven), so a task-only flip looks
                // like "nothing happened". Then finalize the stranded shadow run.
                let steps = self.repo.list_steps(task_id).await?;
                let mut cancelled_step_id = None;
                for step in steps.iter().filter(|s| {
                    matches!(
                        s.status,
                        LaunchTaskStepStatus::NeedsHuman | LaunchTaskStepStatus::Running
                    )
                }) {
                    if let Err(e) = self.cancel_step(&task, step).await {
                        warn!(task_id = %task.id, step_id = %step.id, error = %e, "failed to cancel parked step on reject");
                    } else {
                        cancelled_step_id = Some(step.id);
                    }
                }
                self.move_task_to_cancelled(&task, cancelled_step_id.or(task.current_step_id))
                    .await?;
                self.finalize_task_shadow_run(
                    &task,
                    ShadowRunTerminal::Cancelled,
                    "launch task cancelled",
                )
                .await;
                Ok(Some(CancelOutcome {
                    status: LaunchTaskStatus::Cancelled,
                    signalled: false,
                }))
            }
        }
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
        if self.registry.try_register(task_id, cancel.clone()).is_err() {
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

        // NeedsHuman resume goes through `retry_needs_human_step`; Running
        // re-entry is rejected at the registry guard upstream.
        if !matches!(task.status, LaunchTaskStatus::Pending) {
            return Err(CoreError::InvalidLaunchTaskTransition {
                from: task.status,
                to: LaunchTaskStatus::Running,
            }
            .into());
        }
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

        self.drive_pending_steps(&task, &steps, 0, &cancel).await
    }

    /// Iterate steps starting at `start_idx`, run each Pending step, and
    /// finalise the task as `Completed` when the loop exhausts. Shared
    /// between the cold-start `run_inner` path and the SUP-120 retry path so
    /// the failure-policy handling lives in one place.
    async fn drive_pending_steps(
        &self,
        task: &LaunchTask,
        steps: &[LaunchTaskStep],
        start_idx: usize,
        cancel: &CancellationToken,
    ) -> Result<()> {
        for step in &steps[start_idx..] {
            if step.status.is_terminal() {
                continue;
            }
            if !step.enabled {
                // Disabled steps are persisted for an immutable replay
                // record but never spawned — transition straight to Skipped.
                self.skip_disabled_step(task, step).await?;
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
                self.move_task_to_status(task, LaunchTaskStatus::NeedsHuman, Some(step.id), reason)
                    .await?;
                return Ok(());
            }

            if cancel.is_cancelled() {
                self.move_task_to_cancelled(task, None).await?;
                return Ok(());
            }

            self.start_pending_step(task, step).await?;

            // Cold start: no resume key — the auto-resume loop handles any
            // mid-turn timeout internally before this returns a halt.
            if !self
                .run_step_with_auto_resume(task, step, None, cancel)
                .await?
            {
                return Ok(());
            }
        }

        // All steps completed.
        self.repo.set_current_step(task.id, None).await?;
        self.repo
            .update_task_status(task.id, LaunchTaskStatus::Completed)
            .await
            .with_context(|| format!("launch_task {} → Completed", task.id))?;
        self.finalize_task_shadow_run(task, ShadowRunTerminal::Completed, "launch task completed")
            .await;
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

    /// Move a Pending step to Running, update the parent's `current_step_id`,
    /// and publish `StepStarted`. Used by both the cold-start loop and the
    /// retry path's tail (after the resumed step has already been processed).
    async fn start_pending_step(&self, task: &LaunchTask, step: &LaunchTaskStep) -> Result<()> {
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
        Ok(())
    }

    /// Transition a disabled step (`enabled = false`) straight to
    /// `Skipped` without spawning a run, then publish a `StepFinished` so the
    /// plan strip reflects the skip. The current-step pointer is left untouched.
    async fn skip_disabled_step(&self, task: &LaunchTask, step: &LaunchTaskStep) -> Result<()> {
        self.repo
            .update_step_status(step.id, LaunchTaskStepStatus::Skipped)
            .await
            .with_context(|| format!("step {} → Skipped (disabled in profile)", step.id))?;
        self.publish(LaunchTaskEvent::StepFinished {
            task_id: task.id,
            linear_issue_id: task.linear_issue_id.clone(),
            step_id: step.id,
            step_kind: step.step_kind,
            status: LaunchTaskStepStatus::Skipped,
            summary: Some("step disabled in launch profile".into()),
            failure_classification: None,
            memory_entry_ids: Vec::new(),
        });
        Ok(())
    }

    /// SUP-191 — run (or resume) a step, auto-resuming the Codex session on a
    /// mid-turn timeout up to `max_auto_resumes` times before parking it.
    /// Returns the same `Ok(true)`-to-continue / `Ok(false)`-to-halt contract
    /// as [`Self::handle_step_outcome`], which it delegates to for every
    /// non-timeout outcome.
    ///
    /// The loop is the heart of the gate: each timed-out segment must clear
    /// **all three** gates to be resumed — budget remaining, the worktree diff
    /// moved since the previous segment, and a resume key was captured.
    /// Failing any gate parks the step at `NeedsHuman` with a reason; the diff
    /// gate is what makes the auto-retry safe (a stuck agent parks instead of
    /// burning the full budget).
    ///
    /// `initial_resume` seeds the first attempt: `None` for a cold start, the
    /// step's persisted `resume_key` for an operator retry.
    async fn run_step_with_auto_resume(
        &self,
        task: &LaunchTask,
        step: &LaunchTaskStep,
        initial_resume: Option<ResumeKey>,
        cancel: &CancellationToken,
    ) -> Result<bool> {
        // Only Codex-structured steps capture a resume key (the
        // `provider_session_id` comes solely from Codex SessionMeta), so
        // auto-resume is meaningful only for them. Dynamic steps on any other
        // executor get a zero budget; legacy catalog steps (`executor == None`)
        // keep the configured budget so SUP-191 behaviour is unchanged.
        let max_auto_resumes = match step.executor {
            Some(StepExecutor::CodexStructured) | None => self.max_auto_resumes,
            Some(_) => 0,
        };
        let mut resume = initial_resume;
        let mut segments_used = step.auto_resume_count;
        let mut prev_diff: Option<DiffSnapshot> = None;

        loop {
            let runner_result = self
                .step_runner
                .run_step(task, step, resume.take(), cancel.clone())
                .await;

            let (classification, links, resume_key, diff_snapshot) = match runner_result {
                Ok(StepOutcome::TimedOut {
                    classification,
                    links,
                    resume_key,
                    diff_snapshot,
                }) => (classification, links, resume_key, diff_snapshot),
                // Completed / NeedsHuman / Failed / Cancelled / Err: terminal
                // for this step — the existing handler owns the transition.
                other => return self.handle_step_outcome(task, step, other, cancel).await,
            };

            self.record_step_links(step, &links).await?;

            // Cancellation wins over any park decision — a cancel arriving
            // during the timed-out turn finalises the step as Cancelled.
            if cancel.is_cancelled() {
                self.halt_step_cancelled(task, step).await?;
                return Ok(false);
            }

            let key = match decide_resume(
                segments_used,
                max_auto_resumes,
                prev_diff.as_ref(),
                &diff_snapshot,
                resume_key,
            ) {
                ResumeDecision::Resume(key) => key,
                ResumeDecision::Park { reason, resume_key } => {
                    self.park_timed_out(
                        task,
                        step,
                        classification,
                        segments_used,
                        resume_key,
                        reason,
                    )
                    .await?;
                    return Ok(false);
                }
            };

            segments_used += 1;
            prev_diff = Some(diff_snapshot);
            self.repo
                .set_step_auto_resume(step.id, segments_used, Some(key.as_str().to_string()))
                .await
                .with_context(|| format!("step {} auto-resume persist", step.id))?;
            info!(
                task_id = %task.id,
                step_id = %step.id,
                attempt = segments_used,
                max = max_auto_resumes,
                "auto-resuming timed-out launch step"
            );
            // Re-pulse `StepStarted` so the feed/timeline refetch and pick up
            // the bumped `auto_resume_count` without a dedicated event variant.
            self.publish(LaunchTaskEvent::StepStarted {
                task_id: task.id,
                linear_issue_id: task.linear_issue_id.clone(),
                step_id: step.id,
                step_kind: step.step_kind,
                agent_name: step.agent_name.clone(),
                sequence: step.sequence,
            });
            resume = Some(key);
        }
    }

    /// Persist the final auto-resume bookkeeping and park a timed-out step at
    /// `NeedsHuman` with a reason that names why the loop stopped (SUP-191).
    async fn park_timed_out(
        &self,
        task: &LaunchTask,
        step: &LaunchTaskStep,
        classification: FailureClassification,
        segments_used: u32,
        resume_key: Option<ResumeKey>,
        reason: TimeoutParkReason,
    ) -> Result<()> {
        // Persist the count + last resume key so the UI shows "resumed N×" and
        // an operator retry can resume the same session.
        self.repo
            .set_step_auto_resume(
                step.id,
                segments_used,
                resume_key.as_ref().map(|k| k.as_str().to_string()),
            )
            .await
            .with_context(|| format!("step {} auto-resume park persist", step.id))?;

        let suffix = match reason {
            TimeoutParkReason::Exhausted => {
                format!("auto-resume budget exhausted after {segments_used}× without converging")
            }
            TimeoutParkReason::NoProgress => format!(
                "auto-resume stopped after {segments_used}× — last segment produced no new changes"
            ),
            TimeoutParkReason::NoResumeKey => {
                "no resumable Codex session was captured — cannot continue".to_string()
            }
        };
        let reason_text = format!("{}; {suffix}", classification.human_summary());
        self.park_step_classified(task, step, classification, reason_text)
            .await
    }

    /// Fold a runner result into persisted state + bus events. Returns
    /// `Ok(true)` to continue, `Ok(false)` on halt (NeedsHuman / Failed /
    /// Cancelled).
    async fn handle_step_outcome(
        &self,
        task: &LaunchTask,
        step: &LaunchTaskStep,
        runner_result: Result<StepOutcome>,
        cancel: &CancellationToken,
    ) -> Result<bool> {
        match runner_result {
            Ok(StepOutcome::Completed {
                summary,
                links,
                memory_entry_ids,
            }) => {
                self.repo
                    .add_step_links(
                        step.id,
                        links.run_id,
                        links.conversation_id,
                        links.orchestrator_session_id,
                    )
                    .await
                    .with_context(|| format!("step {} link recording", step.id))?;
                // Successful retry path clears any prior classifier verdict.
                self.repo
                    .set_step_failure_classification(step.id, None)
                    .await
                    .with_context(|| format!("step {} classification clear", step.id))?;
                self.repo
                    .set_step_summary(step.id, summary.clone())
                    .await
                    .with_context(|| format!("step {} summary persist", step.id))?;
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
                    failure_classification: None,
                    memory_entry_ids,
                });
                Ok(true)
            }
            Ok(StepOutcome::Cancelled) => {
                self.halt_step_cancelled(task, step).await?;
                Ok(false)
            }
            Ok(StepOutcome::NeedsHuman {
                classification,
                links,
            }) => {
                self.record_step_links(step, &links).await?;
                self.route_classified_halt(task, step, classification, cancel)
                    .await?;
                Ok(false)
            }
            // The auto-resume loop owns `TimedOut`; reaching here means it was
            // handed straight to `handle_step_outcome` (no loop). Park it as a
            // classified halt — its `Timeout` disposition is `NeedsHuman`.
            Ok(StepOutcome::TimedOut {
                classification,
                links,
                ..
            }) => {
                self.record_step_links(step, &links).await?;
                self.route_classified_halt(task, step, classification, cancel)
                    .await?;
                Ok(false)
            }
            Ok(StepOutcome::Failed {
                classification,
                links,
            }) => {
                self.record_step_links(step, &links).await?;
                self.route_classified_halt(task, step, classification, cancel)
                    .await?;
                Ok(false)
            }
            Err(e) => {
                // Programming-level errors (storage I/O, bugs) have no
                // typed classification. Route through SpawnError so the row
                // still gets a stable discriminant rather than a bare string.
                let classification = FailureClassification::SpawnError {
                    detail: format!("step runner error: {e:#}"),
                };
                self.route_classified_halt(task, step, classification, cancel)
                    .await?;
                Ok(false)
            }
        }
    }

    /// Park a step using the disposition of the supplied classification —
    /// `NeedsHuman` for retryable verdicts, terminal `Failed` for the rest.
    /// Cancellation always wins over either path. The classification is
    /// serialised onto the `failure_classification` column **and** projected
    /// to a human-readable summary so legacy UI (pre-SUP-141) keeps
    /// rendering.
    async fn route_classified_halt(
        &self,
        task: &LaunchTask,
        step: &LaunchTaskStep,
        classification: FailureClassification,
        cancel: &CancellationToken,
    ) -> Result<()> {
        if cancel.is_cancelled() {
            return self.halt_step_cancelled(task, step).await;
        }
        let reason = classification.human_summary();
        self.park_step_classified(task, step, classification, reason)
            .await
    }

    /// Persist a classified halt with an explicit operator-facing `reason` and
    /// drive the parent task to the disposition-matched status. Split out of
    /// [`Self::route_classified_halt`] so the SUP-191 timeout-park path can
    /// supply a richer reason ("…; auto-resumed N×/M without converging")
    /// while sharing the persistence + event + shadow-run-finalize logic.
    /// Callers are responsible for the cancellation check.
    async fn park_step_classified(
        &self,
        task: &LaunchTask,
        step: &LaunchTaskStep,
        classification: FailureClassification,
        reason: String,
    ) -> Result<()> {
        let (step_status, task_status) = match classification.disposition() {
            FailureDisposition::NeedsHuman => (
                LaunchTaskStepStatus::NeedsHuman,
                LaunchTaskStatus::NeedsHuman,
            ),
            FailureDisposition::Failed => (LaunchTaskStepStatus::Failed, LaunchTaskStatus::Failed),
        };
        self.repo
            .set_step_failure_classification(step.id, Some(classification.clone()))
            .await
            .with_context(|| format!("step {} classification persist ({step_status})", step.id))?;
        self.repo
            .set_step_summary(step.id, Some(reason.clone()))
            .await
            .with_context(|| format!("step {} summary persist ({step_status})", step.id))?;
        self.repo
            .update_step_status(step.id, step_status)
            .await
            .with_context(|| format!("step {} → {step_status}", step.id))?;
        self.publish(LaunchTaskEvent::StepFinished {
            task_id: task.id,
            linear_issue_id: task.linear_issue_id.clone(),
            step_id: step.id,
            step_kind: step.step_kind,
            status: step_status,
            summary: Some(reason.clone()),
            failure_classification: Some(classification),
            memory_entry_ids: Vec::new(),
        });
        self.move_task_to_status(task, task_status, Some(step.id), reason.clone())
            .await?;
        // A terminal-Failed disposition is a dead task — drive its shadow run
        // terminal so it stops blocking relaunch and reading "live". NeedsHuman
        // is intentionally left non-terminal for retry.
        if matches!(task_status, LaunchTaskStatus::Failed) {
            self.finalize_task_shadow_run(task, ShadowRunTerminal::Failed, &reason)
                .await;
        }
        Ok(())
    }

    /// Resolve the shadow `Run` backing a task via any step's `linked_run_id`. A
    /// launch task shares one shadow run across its steps, so the first linked
    /// step suffices. `None` before the first step has spawned.
    async fn shadow_run_id_for_task(&self, task_id: LaunchTaskId) -> Result<Option<RunId>> {
        Ok(self
            .repo
            .list_steps(task_id)
            .await?
            .into_iter()
            .find_map(|s| s.linked_run_id))
    }

    /// Drive the shadow run backing `task` to a terminal state via the runner —
    /// which owns shadow `Run`/`RunStep` writes, so the executor never touches
    /// `RunState` directly. Best-effort: a failure is logged, not propagated, so
    /// cleanup never blocks the authoritative task transition (the periodic sweep
    /// is the safety net). Only dead dispositions call this — a parked/timeout run
    /// must stay non-terminal for retry.
    async fn finalize_task_shadow_run(
        &self,
        task: &LaunchTask,
        terminal: ShadowRunTerminal,
        reason: &str,
    ) {
        let run_id = match self.shadow_run_id_for_task(task.id).await {
            Ok(Some(rid)) => rid,
            Ok(None) => return,
            Err(e) => {
                warn!(task_id = %task.id, error = %e, "failed to resolve shadow run for finalize");
                return;
            }
        };
        self.finalize_shadow_run_id(run_id, terminal, reason).await;
    }

    /// Best-effort delegate to the runner's shadow-run finalizer. Logs on error
    /// rather than propagating — the periodic sweep retries, and a stuck
    /// cleanup must never block the authoritative task transition.
    async fn finalize_shadow_run_id(
        &self,
        run_id: RunId,
        terminal: ShadowRunTerminal,
        reason: &str,
    ) {
        if let Err(e) = self
            .step_runner
            .finalize_shadow_run(run_id, terminal, reason)
            .await
        {
            warn!(%run_id, error = %e, "failed to finalize shadow run during reconciliation");
        }
    }

    /// Reconcile one non-terminal Launch Task shadow run: classify by the owning
    /// task and drive the dead ones terminal through the existing owners (task/step
    /// via this executor, run via the runner). The single entry the liveness pass
    /// dispatches to per enumerated run.
    pub async fn reconcile_shadow_run(&self, run: &Run) -> Result<ReconcileOutcome> {
        if run.state.is_terminal() {
            return Ok(ReconcileOutcome::AlreadyTerminal);
        }
        let owning_task = match self.repo.find_step_by_linked_run(run.id).await? {
            Some(step) => self.repo.get(step.launch_task_id).await?,
            None => None,
        };
        let Some(task) = owning_task else {
            // A shadow run with no resolvable launch task is itself an orphan.
            self.finalize_shadow_run_id(
                run.id,
                ShadowRunTerminal::Failed,
                "orphaned shadow run with no owning launch task",
            )
            .await;
            return Ok(ReconcileOutcome::OrphanRunReconciled);
        };

        if matches!(task.status, LaunchTaskStatus::NeedsHuman) {
            // Retryable park — retry reuses this live shadow run. Leave it.
            return Ok(ReconcileOutcome::SkippedParked);
        }
        if let Some(terminal) = ShadowRunTerminal::matching(task.status) {
            // Task already terminal but the run was stranded — finalize to match.
            self.finalize_shadow_run_id(
                run.id,
                terminal,
                &format!(
                    "launch task {} is {} — reconciling stranded shadow run",
                    task.id, task.status
                ),
            )
            .await;
            return Ok(ReconcileOutcome::StrandReconciled);
        }

        // Task is Pending/Running and non-terminal — an orphan unless a live
        // executor still owns it.
        self.reconcile_active_orphan(&task, run.id).await
    }

    /// Drive an active-but-orphaned task (`Pending`/`Running` with no live
    /// executor) and its shadow run terminal. The atomic `try_register` gate is
    /// what distinguishes a genuinely dead execution (boot, or a panicked
    /// task — slot free) from a live one (slot held → skip).
    async fn reconcile_active_orphan(
        &self,
        task: &LaunchTask,
        run_id: RunId,
    ) -> Result<ReconcileOutcome> {
        let cancel = CancellationToken::new();
        if self.registry.try_register(task.id, cancel).is_err() {
            return Ok(ReconcileOutcome::SkippedAlive);
        }
        let _guard = RegistryGuard {
            registry: Arc::clone(&self.registry),
            task_id: task.id,
        };

        // Reload under the gate — the task may have moved between enumeration
        // and acquiring the slot.
        let Some(task) = self.repo.get(task.id).await? else {
            return Ok(ReconcileOutcome::SkippedAlive);
        };
        if let Some(terminal) = ShadowRunTerminal::matching(task.status) {
            self.finalize_shadow_run_id(run_id, terminal, "owning task became terminal")
                .await;
            return Ok(ReconcileOutcome::StrandReconciled);
        }
        if matches!(task.status, LaunchTaskStatus::NeedsHuman) {
            return Ok(ReconcileOutcome::SkippedParked);
        }

        let reason = format!(
            "launch task {} orphaned — no live executor (server restart or crashed run); \
             reconciled to Failed",
            task.id
        );
        // Fail the in-flight step before the task → Failed transition: leaving a
        // Pending/Running current step under a Failed task would strand a
        // non-terminal step. Later Pending steps stay Pending (normal V1 policy).
        if let Some(step_id) = task.current_step_id
            && let Some(step) = self
                .repo
                .list_steps(task.id)
                .await?
                .into_iter()
                .find(|s| s.id == step_id)
            && !step.status.is_terminal()
        {
            match self
                .repo
                .update_step_status(step_id, LaunchTaskStepStatus::Failed)
                .await
            {
                Ok(()) => self.publish(LaunchTaskEvent::StepFinished {
                    task_id: task.id,
                    linear_issue_id: task.linear_issue_id.clone(),
                    step_id,
                    step_kind: step.step_kind,
                    status: LaunchTaskStepStatus::Failed,
                    summary: Some(reason.clone()),
                    failure_classification: None,
                    memory_entry_ids: Vec::new(),
                }),
                Err(e) => {
                    warn!(task_id = %task.id, %step_id, error = %e, "failed to fail orphaned step")
                }
            }
        }
        self.move_task_to_status(
            &task,
            LaunchTaskStatus::Failed,
            task.current_step_id,
            reason.clone(),
        )
        .await?;
        self.finalize_shadow_run_id(run_id, ShadowRunTerminal::Failed, &reason)
            .await;
        Ok(ReconcileOutcome::OrphanReconciled)
    }

    async fn record_step_links(&self, step: &LaunchTaskStep, links: &StepLinks) -> Result<()> {
        self.repo
            .add_step_links(
                step.id,
                links.run_id,
                links.conversation_id,
                links.orchestrator_session_id,
            )
            .await
            .with_context(|| format!("step {} link recording", step.id))
    }

    async fn halt_step_cancelled(&self, task: &LaunchTask, step: &LaunchTaskStep) -> Result<()> {
        self.cancel_step(task, step).await?;
        self.move_task_to_cancelled(task, Some(step.id)).await?;
        self.finalize_task_shadow_run(task, ShadowRunTerminal::Cancelled, "launch task cancelled")
            .await;
        Ok(())
    }

    /// SUP-120 — operator-triggered retry of the step that put a task in
    /// `NeedsHuman`. Re-runs the blocking step with a fresh runner invocation
    /// (which produces a new `RunId` via `add_step_links`), then resumes the
    /// rest of the recipe via the same loop the cold-start path uses.
    ///
    /// Refuses cleanly when the task is not in `NeedsHuman` (`CoreError`
    /// surfaces as 409 in the API), when no `current_step_id` is recorded, or
    /// when the blocking step itself isn't in `NeedsHuman`. Re-entrancy is
    /// gated by the same registry mechanism `run` uses, so a retry races
    /// safely against a concurrent cancel.
    pub async fn retry_needs_human_step(
        &self,
        task_id: LaunchTaskId,
        path: RetryPath,
    ) -> Result<RetryOutcome, RetryError> {
        let cancel = CancellationToken::new();
        if self.registry.try_register(task_id, cancel.clone()).is_err() {
            return Err(RetryError::Other(anyhow!(
                "launch task {task_id} already has a live executor in this process"
            )));
        }
        let _guard = RegistryGuard {
            registry: Arc::clone(&self.registry),
            task_id,
        };

        let task = self
            .repo
            .get(task_id)
            .await?
            .ok_or(RetryError::NotFound(task_id))?;

        task.can_retry()?;

        // Data-integrity invariant, not a state-machine rejection — surface
        // as `Other` (→ 500), not `Core` (→ 409).
        let current_step_id = task.current_step_id.ok_or_else(|| {
            anyhow!("launch task {task_id} in NeedsHuman without a current_step_id")
        })?;

        let mut steps = self.repo.list_steps(task.id).await?;
        steps.sort_by_key(|s| s.sequence);

        let idx = steps
            .iter()
            .position(|s| s.id == current_step_id)
            .ok_or_else(|| anyhow!("current step {current_step_id} not found on task {task_id}"))?;

        if !matches!(steps[idx].status, LaunchTaskStepStatus::NeedsHuman) {
            return Err(RetryError::Core(
                CoreError::InvalidLaunchTaskStepTransition {
                    from: steps[idx].status,
                    to: LaunchTaskStepStatus::Running,
                },
            ));
        }

        let retried_step_id = steps[idx].id;

        self.repo
            .begin_retry(task.id, retried_step_id)
            .await
            .with_context(|| format!("launch_task {task_id} begin_retry"))?;

        self.publish(LaunchTaskEvent::TaskStatusChanged {
            task_id: task.id,
            linear_issue_id: task.linear_issue_id.clone(),
            status: LaunchTaskStatus::Running,
            current_step_id: Some(retried_step_id),
            reason: None,
        });
        self.publish(LaunchTaskEvent::StepStarted {
            task_id: task.id,
            linear_issue_id: task.linear_issue_id.clone(),
            step_id: retried_step_id,
            step_kind: steps[idx].step_kind,
            agent_name: steps[idx].agent_name.clone(),
            sequence: steps[idx].sequence,
        });

        // SUP-191 — resume the parked Codex session when a resume key is
        // persisted; fall back to a fresh run (`None`) when it is absent. The
        // auto-resume loop honours the remaining `max_auto_resumes` budget
        // (the step's `auto_resume_count` seeds it), so a manual retry after
        // an exhausted auto-resume gets one resumed segment then re-parks.
        //
        // SUP-203 — `RetryPath::Fresh` discards the persisted key so the step
        // re-runs on a new provider thread; `FixForward` keeps it (the SUP-191
        // behaviour). The new run overwrites `resume_key` either way.
        let initial_resume = match path {
            RetryPath::FixForward => steps[idx].resume_key.clone().map(ResumeKey::new),
            RetryPath::Fresh => None,
        };
        let should_continue = self
            .run_step_with_auto_resume(&task, &steps[idx], initial_resume, &cancel)
            .await?;

        if should_continue {
            self.drive_pending_steps(&task, &steps, idx + 1, &cancel)
                .await?;
        }

        // Reload to capture the post-retry state and the new linked run id
        // recorded by `add_step_links`. The previous `linked_run_id` is
        // overwritten by design (see SUP-120 plan, "append-only des liens").
        let reloaded_task = self
            .repo
            .get(task.id)
            .await?
            .ok_or_else(|| anyhow!("launch task {task_id} disappeared mid-retry"))?;
        let new_linked_run_id = self
            .repo
            .list_steps(task.id)
            .await?
            .into_iter()
            .find(|s| s.id == retried_step_id)
            .and_then(|s| s.linked_run_id);

        Ok(RetryOutcome {
            task_status: reloaded_task.status,
            retried_step_id,
            new_linked_run_id,
        })
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
            failure_classification: None,
            memory_entry_ids: Vec::new(),
        });
        Ok(())
    }

    /// Flip the parent task to a terminal-ish status (`NeedsHuman` or
    /// `Failed`) with a reason. Cancellation has its own `move_task_to_cancelled`
    /// because it does not carry a reason payload.
    async fn move_task_to_status(
        &self,
        task: &LaunchTask,
        status: LaunchTaskStatus,
        step_id: Option<LaunchTaskStepId>,
        reason: String,
    ) -> Result<()> {
        self.repo
            .update_task_status(task.id, status)
            .await
            .with_context(|| format!("launch_task {} → {status}", task.id))?;
        self.publish(LaunchTaskEvent::TaskStatusChanged {
            task_id: task.id,
            linear_issue_id: task.linear_issue_id.clone(),
            status,
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

    #[test]
    fn decide_resume_continues_when_all_gates_pass() {
        let decision = decide_resume(
            1,
            3,
            Some(&DiffSnapshot::of(b"old")),
            &DiffSnapshot::of(b"new"),
            Some(ResumeKey::new("thread-1".to_string())),
        );
        assert!(matches!(decision, ResumeDecision::Resume(key) if key.as_str() == "thread-1"));
    }

    #[test]
    fn decide_resume_parks_exhausted_at_budget() {
        let decision = decide_resume(
            3,
            3,
            None,
            &DiffSnapshot::of(b"new"),
            Some(ResumeKey::new("thread-1".to_string())),
        );
        assert!(matches!(
            decision,
            ResumeDecision::Park {
                reason: TimeoutParkReason::Exhausted,
                resume_key: Some(_),
            }
        ));
    }

    #[test]
    fn decide_resume_parks_no_progress_on_identical_diff() {
        let decision = decide_resume(
            1,
            3,
            Some(&DiffSnapshot::of(b"same")),
            &DiffSnapshot::of(b"same"),
            Some(ResumeKey::new("thread-1".to_string())),
        );
        assert!(matches!(
            decision,
            ResumeDecision::Park {
                reason: TimeoutParkReason::NoProgress,
                ..
            }
        ));
    }

    #[test]
    fn decide_resume_parks_when_no_resume_key() {
        let decision = decide_resume(1, 3, None, &DiffSnapshot::of(b"new"), None);
        assert!(matches!(
            decision,
            ResumeDecision::Park {
                reason: TimeoutParkReason::NoResumeKey,
                resume_key: None,
            }
        ));
    }

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
            _resume: Option<ResumeKey>,
            _cancel: CancellationToken,
        ) -> Result<StepOutcome> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(StepOutcome::Completed {
                summary: Some(format!("ok {}", step.step_kind)),
                links: StepLinks::default(),
                memory_entry_ids: Vec::new(),
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
            base_branch: None,
            use_worktree: None,
            profile_id: None,
            profile_snapshot: None,
            reuse_worktree: None,
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
            label: None,
            skill_source: None,
            skill_kind: None,
            reasoning: None,
            executor: None,
            session_policy: None,
            output_expectation: None,
            enabled: true,
            status: LaunchTaskStepStatus::Pending,
            linked_run_id: None,
            linked_conversation_id: None,
            linked_orchestrator_session_id: None,
            summary: None,
            structured_result: None,
            failure_classification: None,
            auto_resume_count: 0,
            resume_key: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let outcome = StubStepRunner::new()
            .run_step(&task, &step, None, CancellationToken::new())
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
