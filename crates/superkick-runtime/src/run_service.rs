//! Run lifecycle service (Theme-1 runtime service layer).
//!
//! Owns the persistence + dedup-race path of run spawning and the cancel
//! orchestration that previously lived inline in the `runs` HTTP handler. The
//! handler keeps input/agent-catalog validation and domain `Run` construction;
//! this service owns everything downstream of a fully-built `Run`.
//!
//! Two object-safe seams keep the heavy generics out of `AppState`:
//!   * [`RunSpawn`] erases the 8-generic `StepEngine` behind `EngineRunSpawner`.
//!   * [`LaunchTaskCanceller`] erases the launch-task executor's generics.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use superkick_core::{CoreError, EventKind, EventLevel, Run, RunEvent, RunId, RunState};
use superkick_storage::repo::{LaunchTaskRepo, RunEventRepo, RunRepo};
use tokio_util::sync::CancellationToken;

/// Object-safe seam for kicking off run execution. Production wires
/// `EngineRunSpawner`, which owns the in-flight cancellation registry so the
/// CancellationToken-stored-before-spawn invariant lives in one place. Tests
/// inject a `NoopRunSpawner`.
pub trait RunSpawn: Send + Sync + 'static {
    /// Begin executing `run`. Returns the token controlling that execution;
    /// implementations MUST store the token before spawning so a cancel
    /// arriving immediately afterwards cannot miss it.
    fn spawn(&self, run: Run) -> CancellationToken;
    /// Signal-and-remove the in-flight token for `run_id`, if any. No-op when
    /// the run is not currently executing in this process.
    fn cancel(&self, run_id: RunId);
}

impl<T: RunSpawn + ?Sized> RunSpawn for Arc<T> {
    fn spawn(&self, run: Run) -> CancellationToken {
        (**self).spawn(run)
    }
    fn cancel(&self, run_id: RunId) {
        (**self).cancel(run_id)
    }
}

/// Object-safe seam over the launch-task executor's `cancel`. `RunService`
/// holds this rather than the full `ProdLaunchTaskExecutor` generic so the
/// engine/runner type parameters never leak into `AppState`.
pub trait LaunchTaskCanceller: Send + Sync + 'static {
    fn cancel<'a>(
        &'a self,
        id: superkick_core::LaunchTaskId,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send + 'a>>;
}

impl<R, S> LaunchTaskCanceller for crate::LaunchTaskExecutor<R, S>
where
    R: LaunchTaskRepo + 'static,
    S: crate::StepRunner,
{
    fn cancel<'a>(
        &'a self,
        id: superkick_core::LaunchTaskId,
    ) -> Pin<Box<dyn Future<Output = anyhow::Result<()>> + Send + 'a>> {
        Box::pin(async move {
            crate::LaunchTaskExecutor::cancel(self, id).await?;
            Ok(())
        })
    }
}

/// Service-level error surfaced to the HTTP edge. `superkick-api` maps each
/// variant onto the existing `AppError` shapes — no new status codes.
#[derive(Debug, thiserror::Error)]
pub enum RunServiceError {
    /// Dedup conflict (still-active run) or an invalid domain transition. Maps
    /// to the existing 409 shapes via `AppError::from(CoreError)`.
    #[error(transparent)]
    Conflict(CoreError),
    /// Unique-violation re-check found no active run — the conflicting run
    /// finished between guard and insert. Maps to 500 with the existing
    /// "concurrent race resolved" log.
    #[error(
        "unique constraint violated but no active run for issue {0} — concurrent race resolved"
    )]
    RaceResolved(String),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

pub struct RunService<R, L, E, S = Arc<dyn RunSpawn>>
where
    R: RunRepo + 'static,
    L: LaunchTaskRepo + 'static,
    E: RunEventRepo + 'static,
    S: RunSpawn,
{
    run_repo: Arc<R>,
    launch_task_repo: Arc<L>,
    event_repo: Arc<E>,
    launch_task_canceller: Arc<dyn LaunchTaskCanceller>,
    spawner: S,
}

impl<R, L, E, S> RunService<R, L, E, S>
where
    R: RunRepo + 'static,
    L: LaunchTaskRepo + 'static,
    E: RunEventRepo + 'static,
    S: RunSpawn,
{
    pub fn new(
        run_repo: Arc<R>,
        launch_task_repo: Arc<L>,
        event_repo: Arc<E>,
        launch_task_canceller: Arc<dyn LaunchTaskCanceller>,
        spawner: S,
    ) -> Arc<Self> {
        Arc::new(Self {
            run_repo,
            launch_task_repo,
            event_repo,
            launch_task_canceller,
            spawner,
        })
    }

    /// Insert a fully-constructed+validated run, resolving the dedup race on a
    /// unique-violation, then kick off execution via the spawner seam.
    pub async fn spawn_run(&self, run: Run) -> Result<Run, RunServiceError> {
        if let Err(err) = self.run_repo.insert(&run).await {
            if superkick_storage::is_unique_violation(&err) {
                // Re-check: the conflicting run may have finished between our
                // guard and insert.
                let existing = self
                    .run_repo
                    .find_active_by_issue_identifier(&run.issue_identifier)
                    .await
                    .map_err(RunServiceError::Internal)?;
                return match Run::guard_no_active(existing.as_ref(), &run.issue_identifier) {
                    // Still active → 409 Conflict
                    Err(core_err) => Err(RunServiceError::Conflict(core_err)),
                    // Race resolved: conflicting run finished between guard and insert.
                    Ok(()) => Err(RunServiceError::RaceResolved(run.issue_identifier.clone())),
                };
            }
            return Err(RunServiceError::Internal(err));
        }

        self.spawner.spawn(run.clone());
        Ok(run)
    }

    /// Cancel a run. `Ok(None)` → 404; `Ok(Some(run))` → 200.
    pub async fn cancel_run(&self, run_id: RunId) -> Result<Option<Run>, RunServiceError> {
        self.spawner.cancel(run_id);

        let Some(mut run) = self
            .run_repo
            .get(run_id)
            .await
            .map_err(RunServiceError::Internal)?
        else {
            return Ok(None);
        };
        if run.state.is_terminal() {
            return Ok(Some(run));
        }

        if let Some(step) = self
            .launch_task_repo
            .find_step_by_linked_run(run_id)
            .await
            .map_err(RunServiceError::Internal)?
            && !step.status.is_terminal()
        {
            tracing::info!(%run_id, launch_task_id = %step.launch_task_id, "cancel run via launch-task executor");
            // Ordering invariant: the executor.cancel call touches only the
            // launch_task row, never the run — so the conditional transition +
            // emit below remain the sole writer of the run's terminal state.
            self.launch_task_canceller
                .cancel(step.launch_task_id)
                .await
                .map_err(RunServiceError::Internal)?;
            let mut refreshed = self
                .run_repo
                .get(run_id)
                .await
                .map_err(RunServiceError::Internal)?
                .ok_or_else(|| RunServiceError::Internal(anyhow::anyhow!("run not found")))?;
            if !refreshed.state.is_terminal() {
                refreshed
                    .transition_to(RunState::Cancelled)
                    .map_err(RunServiceError::Conflict)?;
                self.run_repo
                    .update(&refreshed)
                    .await
                    .map_err(RunServiceError::Internal)?;
                self.emit_cancel_event(refreshed.id).await;
            }
            return Ok(Some(refreshed));
        }

        tracing::info!(%run_id, "cancel run via direct state transition");
        run.transition_to(RunState::Cancelled)
            .map_err(RunServiceError::Conflict)?;
        self.run_repo
            .update(&run)
            .await
            .map_err(RunServiceError::Internal)?;
        self.emit_cancel_event(run.id).await;
        Ok(Some(run))
    }

    /// Sole writer for the shadow-run terminal transition on operator cancel:
    /// `launch_task_canceller.cancel` only touches the launch_task row, never
    /// the run. If that invariant changes, gate this emit to avoid a double
    /// `state_change`.
    async fn emit_cancel_event(&self, run_id: RunId) {
        let event = RunEvent::new(
            run_id,
            None,
            EventKind::StateChange,
            EventLevel::Info,
            "run cancelled by operator".to_string(),
        );
        crate::run_events::emit_built_event(&*self.event_repo, &event, "cancel").await;
    }
}
