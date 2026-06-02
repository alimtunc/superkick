//! Launch Task liveness / orphan reconciliation.
//!
//! A dead, hung, or restart-orphaned Launch Task leaves its shadow run
//! non-terminal: the issue reads "live" forever and relaunch is refused with a
//! 409. This module reconciles those orphans by orchestrating the existing
//! owners — it never writes `LaunchTask`/`RunState` directly (task/step stay in
//! [`LaunchTaskExecutor`], run/run-step in the `StepRunner`), and is separate
//! from `recovery_scheduler`'s no-mutation invariant.
//!
//! Two entry points: [`reconcile_launch_task_orphans`] (one-shot, awaited at
//! boot) and [`spawn_launch_task_liveness_sweep`] (the same pass on an interval,
//! gated by the executor's atomic `try_register` so it only reaps dead runs).

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use chrono::Utc;
use tokio::task::JoinHandle;
use tokio::time::MissedTickBehavior;
use tracing::{info, warn};

use superkick_core::{AgentStatus, EventKind, EventLevel, RunId, StepStatus};
use superkick_storage::repo::{
    AgentSessionRepo, LaunchTaskRepo, RunEventRepo, RunRepo, RunStepRepo,
};

use crate::launch_task_event_bus::{LaunchTaskEvent, LaunchTaskEventBus};
use crate::launch_task_executor::{
    LaunchTaskExecutor, ReconcileOutcome, ShadowRunTerminal, StepRunner,
};
use crate::step_engine::emit_event;

/// Cap on the reconciliation reason persisted to `runs.error_message`.
const REASON_MAX_CHARS: usize = 512;

/// How often the in-process liveness sweep runs. Long relative to a step so it
/// never races a healthy run: boot handles restart orphans, this only catches a
/// mid-session executor that died without a restart.
pub const DEFAULT_LIVENESS_SWEEP_INTERVAL: Duration = Duration::from_secs(120);

/// Tally of one reconciliation pass, surfaced to the operator log.
#[derive(Debug, Default, Clone, Copy)]
pub struct ReconcileReport {
    pub scanned: usize,
    pub reconciled: usize,
    pub skipped_parked: usize,
    pub skipped_alive: usize,
    pub errors: usize,
}

impl ReconcileReport {
    fn record(&mut self, outcome: ReconcileOutcome) {
        self.scanned += 1;
        match outcome {
            ReconcileOutcome::OrphanReconciled
            | ReconcileOutcome::OrphanRunReconciled
            | ReconcileOutcome::StrandReconciled => self.reconciled += 1,
            ReconcileOutcome::SkippedParked => self.skipped_parked += 1,
            ReconcileOutcome::SkippedAlive | ReconcileOutcome::AlreadyTerminal => {
                self.skipped_alive += 1
            }
        }
    }
}

/// One reconciliation pass over every non-terminal Launch Task shadow run.
/// Awaited at boot (before serving) and on each sweep tick. Never propagates a
/// per-run failure — one bad row must not abort the whole pass.
pub async fn reconcile_launch_task_orphans<R, S, RR>(
    executor: &LaunchTaskExecutor<R, S>,
    run_repo: &RR,
) -> Result<ReconcileReport>
where
    R: LaunchTaskRepo,
    S: StepRunner,
    RR: RunRepo,
{
    let runs = run_repo.list_active_launch_task_runs().await?;
    let mut report = ReconcileReport::default();
    for run in runs {
        match executor.reconcile_shadow_run(&run).await {
            Ok(outcome) => report.record(outcome),
            Err(e) => {
                warn!(run_id = %run.id, error = %e, "failed to reconcile shadow run");
                report.errors += 1;
            }
        }
    }
    if report.reconciled > 0 || report.errors > 0 {
        info!(
            scanned = report.scanned,
            reconciled = report.reconciled,
            skipped_parked = report.skipped_parked,
            skipped_alive = report.skipped_alive,
            errors = report.errors,
            "launch-task liveness reconciliation pass complete"
        );
    }
    Ok(report)
}

/// Spawn the periodic in-process liveness sweep. Lives for the process. The
/// first (immediate) tick is dropped — boot already ran one pass. Distinct from
/// `recovery_scheduler`, which classifies but never mutates run state.
pub fn spawn_launch_task_liveness_sweep<R, S, RR>(
    executor: Arc<LaunchTaskExecutor<R, S>>,
    run_repo: Arc<RR>,
    interval: Duration,
) -> JoinHandle<()>
where
    R: LaunchTaskRepo + 'static,
    S: StepRunner,
    RR: RunRepo + 'static,
{
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(interval);
        ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
        ticker.tick().await; // drop the immediate first tick — boot covered it
        loop {
            ticker.tick().await;
            if let Err(e) = reconcile_launch_task_orphans(&executor, &*run_repo).await {
                warn!(error = %e, "launch-task liveness sweep tick failed; will retry next interval");
            }
        }
    })
}

/// The repos `terminalize_shadow_run` writes through, bundled to keep its arg list small.
pub(crate) struct ShadowRunRepos<'a, R, ST, A, E, L> {
    pub run: &'a R,
    pub step: &'a ST,
    pub session: &'a A,
    pub event: &'a E,
    pub launch_task: &'a L,
}

/// Drive a shadow `Run` (plus its still-running steps and sessions) to a
/// terminal state and emit a `StateChange` ledger row. Idempotent: a no-op once
/// the run is terminal, so live-path and reconciliation calls can't double-write.
/// The `StateChange` row is what invalidates the run-detail UI over SSE.
pub(crate) async fn terminalize_shadow_run<R, ST, A, E, L>(
    repos: ShadowRunRepos<'_, R, ST, A, E, L>,
    launch_task_bus: &LaunchTaskEventBus,
    run_id: RunId,
    terminal: ShadowRunTerminal,
    reason: &str,
) -> Result<()>
where
    R: RunRepo,
    ST: RunStepRepo,
    A: AgentSessionRepo,
    E: RunEventRepo,
    L: LaunchTaskRepo,
{
    let Some(mut run) = repos.run.get(run_id).await? else {
        return Ok(()); // run vanished — nothing to finalize
    };
    if run.state.is_terminal() {
        return Ok(()); // idempotent — already reconciled / finished cleanly
    }

    let now = Utc::now();
    let new_state = terminal.to_run_state();
    let owning_step = match repos.launch_task.find_step_by_linked_run(run_id).await {
        Ok(step) => step,
        Err(e) => {
            warn!(run_id = %run_id, error = %e, "failed to resolve owning step for ShadowRunStateChanged; SSE publish skipped");
            None
        }
    };

    // Shadow run state write. This is the sole on-the-fly writer of shadow
    // `RunState` outside `RealStepRunner::set_shadow_run_state`; both bypass the
    // playbook FSM because the shadow run is a synthetic mirror.
    run.state = new_state;
    run.updated_at = now;
    run.finished_at = Some(now);
    run.error_message = Some(crate::text::truncate_chars(reason, REASON_MAX_CHARS));
    repos.run.update(&run).await?;
    if let Some(step) = &owning_step {
        launch_task_bus.publish(LaunchTaskEvent::ShadowRunStateChanged {
            task_id: step.launch_task_id,
            linear_issue_id: run.issue_id.clone(),
            run_id,
            state: new_state,
        });
    }

    // Finish any still-running shadow run_step so the dashboard timeline stops
    // showing "In progress" / a pulsing "live" glyph.
    let step_status = match terminal {
        ShadowRunTerminal::Completed => StepStatus::Succeeded,
        ShadowRunTerminal::Failed | ShadowRunTerminal::Cancelled => StepStatus::Failed,
    };
    match repos.step.list_by_run(run_id).await {
        Ok(steps) => {
            for mut rs in steps {
                if matches!(rs.status, StepStatus::Pending | StepStatus::Running) {
                    rs.status = step_status;
                    rs.finished_at = Some(now);
                    rs.error_message = Some(reason.to_string());
                    if let Err(e) = repos.step.update(&rs).await {
                        warn!(run_id = %run_id, step_id = %rs.id, error = %e, "failed to finish shadow run_step during reconciliation");
                    }
                }
            }
        }
        Err(e) => {
            warn!(run_id = %run_id, error = %e, "failed to list shadow run_steps during reconciliation")
        }
    }

    // Finalize any session left Running with a now-dead pid so the run inspector
    // stops selecting it as the "active" session.
    let session_status = match terminal {
        ShadowRunTerminal::Cancelled => AgentStatus::Cancelled,
        ShadowRunTerminal::Completed => AgentStatus::Completed,
        ShadowRunTerminal::Failed => AgentStatus::Failed,
    };
    match repos.session.list_by_run(run_id).await {
        Ok(sessions) => {
            for mut session in sessions {
                if matches!(session.status, AgentStatus::Starting | AgentStatus::Running) {
                    session.status = session_status;
                    session.finished_at = Some(now);
                    if let Err(e) = repos.session.update(&session).await {
                        warn!(run_id = %run_id, session_id = %session.id, error = %e, "failed to finalize orphaned session during reconciliation");
                    }
                }
            }
        }
        Err(e) => {
            warn!(run_id = %run_id, error = %e, "failed to list sessions during reconciliation")
        }
    }

    // Operator-visible ledger row → PublishingRunEventRepo → workspace bus → SSE
    // → run-detail invalidation. This is what makes the UI stop reading "live"
    // without a manual reload.
    let level = match terminal {
        ShadowRunTerminal::Cancelled => EventLevel::Warn,
        ShadowRunTerminal::Completed => EventLevel::Info,
        ShadowRunTerminal::Failed => EventLevel::Error,
    };
    emit_event(
        repos.event,
        run_id,
        None,
        EventKind::StateChange,
        level,
        reason.to_string(),
    )
    .await;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use tokio_util::sync::CancellationToken;

    use superkick_core::{
        AgentProvider, AgentSession, AgentSessionId, ExecutionMode, LaunchReason, LaunchStepKind,
        LaunchTask, LaunchTaskStatus, LaunchTaskStep, LaunchTaskStepStatus, Run, RunState, RunStep,
        StepId, StepKey, TriggerSource,
    };
    use superkick_storage::{
        SqliteAgentSessionRepo, SqliteLaunchTaskRepo, SqliteRunEventRepo, SqliteRunRepo,
        SqliteRunStepRepo, connect,
    };

    use crate::launch_task_executor::{StepLinks, StepOutcome};
    use crate::launch_task_registry::LaunchTaskRegistry;
    use crate::test_support::{agents, catalog};

    /// Bundle of real-SQLite repos sharing one pool, for the reconciliation
    /// end-to-end tests.
    #[derive(Clone)]
    struct Repos {
        run: Arc<SqliteRunRepo>,
        step: Arc<SqliteRunStepRepo>,
        session: Arc<SqliteAgentSessionRepo>,
        event: Arc<SqliteRunEventRepo>,
        lt: Arc<SqliteLaunchTaskRepo>,
        bus: Arc<LaunchTaskEventBus>,
    }

    /// A `StepRunner` whose `finalize_shadow_run` delegates to the real
    /// `terminalize_shadow_run`, so the reconcile path exercises the genuine
    /// shadow-run write rather than a stub. `run_step` is never called by the
    /// reconciler.
    struct DelegatingRunner {
        repos: Repos,
    }

    impl StepRunner for DelegatingRunner {
        async fn run_step(
            &self,
            _task: &LaunchTask,
            _step: &LaunchTaskStep,
            _cancel: CancellationToken,
        ) -> Result<StepOutcome> {
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
            reason: &str,
        ) -> Result<()> {
            terminalize_shadow_run(
                ShadowRunRepos {
                    run: &*self.repos.run,
                    step: &*self.repos.step,
                    session: &*self.repos.session,
                    event: &*self.repos.event,
                    launch_task: &*self.repos.lt,
                },
                &self.repos.bus,
                run_id,
                terminal,
                reason,
            )
            .await
        }
    }

    /// Seed a launch task that was `Running` (its first step `Running`, linked
    /// to a `Coding` shadow run with a live session) when its process died — a
    /// restart orphan. Returns the repos, the reloaded task, and the shadow run.
    async fn seed_orphan_running(
        issue: &str,
        current_step_status: LaunchTaskStepStatus,
    ) -> Result<(Repos, LaunchTask, RunId)> {
        let pool = connect("sqlite::memory:").await?;
        let repos = Repos {
            run: Arc::new(SqliteRunRepo::new(pool.clone())),
            step: Arc::new(SqliteRunStepRepo::new(pool.clone())),
            session: Arc::new(SqliteAgentSessionRepo::new(pool.clone())),
            event: Arc::new(SqliteRunEventRepo::new(pool.clone())),
            lt: Arc::new(SqliteLaunchTaskRepo::new(pool.clone())),
            bus: LaunchTaskEventBus::new(),
        };

        let (task, steps) = LaunchTask::new_with_v1_recipe(issue, agents(), &catalog())?;
        repos.lt.insert_with_steps(&task, &steps).await?;
        let plan = steps.iter().find(|s| s.sequence == 1).unwrap();

        let mut run = Run::new(
            issue.into(),
            issue.into(),
            "owner/repo".into(),
            TriggerSource::LaunchTask,
            ExecutionMode::FullAuto,
            "main".into(),
            true,
            None,
        );
        run.state = RunState::Coding;
        let run_id = run.id;
        repos.run.insert(&run).await?;
        let mut rs = RunStep::new(run_id, StepKey::Code, 1);
        rs.status = StepStatus::Running;
        rs.started_at = Some(Utc::now());
        repos.step.insert(&rs).await?;
        repos.session.insert(&shadow_session(run_id, rs.id)).await?;

        // Drive the launch task into the live-Running shape a crash leaves behind.
        repos
            .lt
            .add_step_links(plan.id, Some(run_id), None, None)
            .await?;
        repos
            .lt
            .update_task_status(task.id, LaunchTaskStatus::Running)
            .await?;
        repos.lt.set_current_step(task.id, Some(plan.id)).await?;
        // The step is `Pending` after insert; advance it only when the scenario
        // wants a started step (Pending→Running is the sole one-hop used here).
        if current_step_status != LaunchTaskStepStatus::Pending {
            repos
                .lt
                .update_step_status(plan.id, current_step_status)
                .await?;
        }
        let task = repos.lt.get(task.id).await?.expect("task");
        Ok((repos, task, run_id))
    }

    #[tokio::test]
    async fn orphan_running_task_is_reconciled_and_relaunch_unblocked() -> Result<()> {
        let (repos, task, run_id) =
            seed_orphan_running("SUP-186-ORPH", LaunchTaskStepStatus::Running).await?;
        let exec = LaunchTaskExecutor::new(
            Arc::clone(&repos.lt),
            Arc::clone(&repos.bus),
            Arc::new(LaunchTaskRegistry::new()),
            Arc::new(DelegatingRunner {
                repos: repos.clone(),
            }),
        );

        // Pre-condition: the dead shadow run blocks relaunch.
        assert!(
            repos
                .run
                .find_active_by_issue_identifier("SUP-186-ORPH")
                .await?
                .is_some()
        );

        let report = reconcile_launch_task_orphans(&exec, &*repos.run).await?;
        assert_eq!(report.reconciled, 1, "the orphan must be reconciled");

        assert_eq!(
            repos.run.get(run_id).await?.unwrap().state,
            RunState::Failed,
            "shadow run driven terminal"
        );
        assert_eq!(
            repos.lt.get(task.id).await?.unwrap().status,
            LaunchTaskStatus::Failed,
            "orphaned task driven terminal"
        );
        let plan = repos
            .lt
            .list_steps(task.id)
            .await?
            .into_iter()
            .find(|s| matches!(s.step_kind, LaunchStepKind::Plan))
            .unwrap();
        assert_eq!(
            plan.status,
            LaunchTaskStepStatus::Failed,
            "in-flight step failed"
        );

        // The acceptance criterion: relaunch is no longer blocked.
        assert!(
            repos
                .run
                .find_active_by_issue_identifier("SUP-186-ORPH")
                .await?
                .is_none(),
            "after reconciliation the dead shadow run no longer blocks relaunch"
        );
        Ok(())
    }

    #[tokio::test]
    async fn orphan_with_a_pending_current_step_fails_that_step_too() -> Result<()> {
        // Defensive: a current step left Pending (not Running) must still be
        // failed when its task is reconciled, so a Failed task never strands a
        // non-terminal current step.
        let (repos, task, _run_id) =
            seed_orphan_running("SUP-186-PEND", LaunchTaskStepStatus::Pending).await?;
        let exec = LaunchTaskExecutor::new(
            Arc::clone(&repos.lt),
            Arc::clone(&repos.bus),
            Arc::new(LaunchTaskRegistry::new()),
            Arc::new(DelegatingRunner {
                repos: repos.clone(),
            }),
        );

        let report = reconcile_launch_task_orphans(&exec, &*repos.run).await?;
        assert_eq!(report.reconciled, 1);
        assert_eq!(
            repos.lt.get(task.id).await?.unwrap().status,
            LaunchTaskStatus::Failed
        );
        let plan = repos
            .lt
            .list_steps(task.id)
            .await?
            .into_iter()
            .find(|s| matches!(s.step_kind, LaunchStepKind::Plan))
            .unwrap();
        assert_eq!(
            plan.status,
            LaunchTaskStepStatus::Failed,
            "a Pending current step must not be left non-terminal under a Failed task"
        );
        Ok(())
    }

    #[tokio::test]
    async fn needs_human_task_run_is_left_alone() -> Result<()> {
        let (repos, task, run_id) =
            seed_orphan_running("SUP-186-NH2", LaunchTaskStepStatus::Running).await?;
        repos
            .lt
            .update_task_status(task.id, LaunchTaskStatus::NeedsHuman)
            .await?;
        let exec = LaunchTaskExecutor::new(
            Arc::clone(&repos.lt),
            Arc::clone(&repos.bus),
            Arc::new(LaunchTaskRegistry::new()),
            Arc::new(DelegatingRunner {
                repos: repos.clone(),
            }),
        );

        let report = reconcile_launch_task_orphans(&exec, &*repos.run).await?;
        assert_eq!(report.skipped_parked, 1);
        assert_eq!(
            repos.run.get(run_id).await?.unwrap().state,
            RunState::Coding,
            "a NeedsHuman park keeps its shadow run live for retry"
        );
        Ok(())
    }

    #[tokio::test]
    async fn live_executor_task_is_skipped() -> Result<()> {
        let (repos, task, run_id) =
            seed_orphan_running("SUP-186-LIVE", LaunchTaskStepStatus::Running).await?;
        let registry = Arc::new(LaunchTaskRegistry::new());
        // A live executor holds the slot — the mid-session sweep must not touch it.
        registry
            .try_register(task.id, CancellationToken::new())
            .expect("slot free");
        let exec = LaunchTaskExecutor::new(
            Arc::clone(&repos.lt),
            Arc::clone(&repos.bus),
            Arc::clone(&registry),
            Arc::new(DelegatingRunner {
                repos: repos.clone(),
            }),
        );

        let report = reconcile_launch_task_orphans(&exec, &*repos.run).await?;
        assert_eq!(report.skipped_alive, 1);
        assert_eq!(
            repos.run.get(run_id).await?.unwrap().state,
            RunState::Coding,
            "a live task's shadow run must be left untouched"
        );
        assert_eq!(
            repos.lt.get(task.id).await?.unwrap().status,
            LaunchTaskStatus::Running
        );
        Ok(())
    }

    fn shadow_session(run_id: RunId, step_id: StepId) -> AgentSession {
        AgentSession {
            id: AgentSessionId::new(),
            run_id,
            run_step_id: step_id,
            provider: AgentProvider::Codex,
            command: "codex exec".into(),
            pid: Some(4242),
            status: AgentStatus::Running,
            started_at: Utc::now(),
            finished_at: None,
            exit_code: None,
            linear_context_mode: None,
            mcp_servers_used: Vec::new(),
            tools_allow_snapshot: None,
            tool_approval_required: false,
            tool_results_persisted: true,
            role: Some("coder".into()),
            purpose: Some("liveness test".into()),
            parent_session_id: None,
            launch_reason: Some(LaunchReason::InitialStep),
            handoff_id: None,
            provider_session_id: None,
            runner_mode: None,
            billing_profile: None,
        }
    }

    #[tokio::test]
    async fn terminalize_drives_run_step_and_session_terminal_and_emits_event() {
        let pool = connect("sqlite::memory:").await.expect("db");
        let run_repo = SqliteRunRepo::new(pool.clone());
        let step_repo = SqliteRunStepRepo::new(pool.clone());
        let session_repo = SqliteAgentSessionRepo::new(pool.clone());
        let event_repo = SqliteRunEventRepo::new(pool.clone());
        let lt_repo = SqliteLaunchTaskRepo::new(pool.clone());
        let bus = LaunchTaskEventBus::new();

        // A shadow run wedged mid-step (Coding), with a Running run_step + session.
        let mut run = Run::new(
            "SUP-186".into(),
            "SUP-186".into(),
            "owner/repo".into(),
            TriggerSource::LaunchTask,
            ExecutionMode::FullAuto,
            "main".into(),
            true,
            None,
        );
        run.state = RunState::Coding;
        let run_id = run.id;
        run_repo.insert(&run).await.expect("insert run");

        let mut rs = RunStep::new(run_id, StepKey::Code, 1);
        rs.status = StepStatus::Running;
        rs.started_at = Some(Utc::now());
        step_repo.insert(&rs).await.expect("insert run_step");

        let session = shadow_session(run_id, rs.id);
        session_repo.insert(&session).await.expect("insert session");

        terminalize_shadow_run(
            ShadowRunRepos {
                run: &run_repo,
                step: &step_repo,
                session: &session_repo,
                event: &event_repo,
                launch_task: &lt_repo,
            },
            &bus,
            run_id,
            ShadowRunTerminal::Failed,
            "agent process orphaned — reconciled to Failed",
        )
        .await
        .expect("terminalize");

        let reloaded = run_repo.get(run_id).await.unwrap().expect("run");
        assert_eq!(
            reloaded.state,
            RunState::Failed,
            "shadow run must leave the non-terminal phase"
        );
        assert!(
            reloaded.finished_at.is_some(),
            "terminal run stamps finished_at"
        );

        let steps = step_repo.list_by_run(run_id).await.unwrap();
        assert_eq!(
            steps[0].status,
            StepStatus::Failed,
            "the still-Running shadow run_step must be finished"
        );
        assert!(steps[0].finished_at.is_some());

        let sessions = session_repo.list_by_run(run_id).await.unwrap();
        assert_eq!(
            sessions[0].status,
            AgentStatus::Failed,
            "a Running session with a dead pid must be finalized"
        );

        let events = event_repo.list_by_run(run_id).await.unwrap();
        assert!(
            events
                .iter()
                .any(|e| e.kind == EventKind::StateChange && e.message.contains("orphaned")),
            "a readable StateChange ledger row must explain the reconciliation"
        );

        // Idempotent: a second pass (already-terminal) must not double-write or re-emit.
        terminalize_shadow_run(
            ShadowRunRepos {
                run: &run_repo,
                step: &step_repo,
                session: &session_repo,
                event: &event_repo,
                launch_task: &lt_repo,
            },
            &bus,
            run_id,
            ShadowRunTerminal::Failed,
            "second pass",
        )
        .await
        .expect("idempotent terminalize");
        let events_after = event_repo.list_by_run(run_id).await.unwrap();
        assert_eq!(
            events.len(),
            events_after.len(),
            "already-terminal run must be a no-op (no duplicate event)"
        );
    }
}
