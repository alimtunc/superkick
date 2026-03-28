//! Interrupt service — creates and resolves human interrupts on blocked runs.

use std::sync::Arc;

use anyhow::{bail, Context, Result};
use tracing::info;

use superkick_core::{
    EventKind, EventLevel, Interrupt, InterruptAction, InterruptId, InterruptStatus, RunEvent,
    RunId, RunState, StepId,
};
use superkick_storage::repo::{InterruptRepo, RunEventRepo, RunRepo, RunStepRepo};

/// Handles the lifecycle of human interrupts.
pub struct InterruptService<R, ST, E, I> {
    run_repo: Arc<R>,
    step_repo: Arc<ST>,
    event_repo: Arc<E>,
    interrupt_repo: Arc<I>,
}

impl<R, ST, E, I> InterruptService<R, ST, E, I>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    I: InterruptRepo + 'static,
{
    pub fn new(
        run_repo: Arc<R>,
        step_repo: Arc<ST>,
        event_repo: Arc<E>,
        interrupt_repo: Arc<I>,
    ) -> Self {
        Self {
            run_repo,
            step_repo,
            event_repo,
            interrupt_repo,
        }
    }

    /// Create an interrupt, transition the run to `WaitingHuman`, and persist everything.
    pub async fn create_interrupt(
        &self,
        run_id: RunId,
        step_id: Option<StepId>,
        question: String,
    ) -> Result<Interrupt> {
        let mut run = self
            .run_repo
            .get(run_id)
            .await?
            .context("run not found")?;

        // Transition to WaitingHuman.
        run.transition_to(RunState::WaitingHuman)
            .context("cannot transition run to waiting_human")?;
        self.run_repo.update(&run).await?;

        // Create the interrupt record.
        let interrupt = Interrupt::new(run_id, step_id, question);
        self.interrupt_repo.insert(&interrupt).await?;

        // Emit events.
        self.emit(
            run_id,
            step_id,
            EventKind::StateChange,
            EventLevel::Info,
            "run state → waiting_human".into(),
        )
        .await;
        self.emit(
            run_id,
            step_id,
            EventKind::InterruptCreated,
            EventLevel::Warn,
            format!("interrupt created: {}", interrupt.question),
        )
        .await;

        info!(run_id = %run_id, interrupt_id = %interrupt.id, "interrupt created");
        Ok(interrupt)
    }

    /// Answer a pending interrupt and execute the chosen action.
    pub async fn answer_interrupt(
        &self,
        interrupt_id: InterruptId,
        action: InterruptAction,
    ) -> Result<()> {
        let mut interrupt = self
            .interrupt_repo
            .get(interrupt_id)
            .await?
            .context("interrupt not found")?;

        if interrupt.status != InterruptStatus::Pending {
            bail!("interrupt is not pending (status: {:?})", interrupt.status);
        }

        let mut run = self
            .run_repo
            .get(interrupt.run_id)
            .await?
            .context("run not found")?;

        if run.state != RunState::WaitingHuman {
            bail!("run is not in waiting_human state (state: {})", run.state);
        }

        // Resolve the interrupt.
        interrupt.resolve(&action);
        self.interrupt_repo.update(&interrupt).await?;

        self.emit(
            run.id,
            interrupt.run_step_id,
            EventKind::InterruptResolved,
            EventLevel::Info,
            format!("interrupt resolved with action: {}", action_label(&action)),
        )
        .await;

        // Execute the action.
        match &action {
            InterruptAction::RetryStep => {
                // Transition back to Queued so the engine can re-execute.
                run.transition_to(RunState::Queued)
                    .context("cannot transition run back to queued for retry")?;
                run.error_message = None;
                self.run_repo.update(&run).await?;

                self.emit(
                    run.id,
                    None,
                    EventKind::StateChange,
                    EventLevel::Info,
                    "run state → queued (retry after interrupt)".into(),
                )
                .await;

                info!(run_id = %run.id, "run requeued after interrupt retry");
            }
            InterruptAction::ContinueWithNote { note } => {
                // Dismiss the blockage and continue from where we left off.
                // Transition to the next logical state — back to the step that was running.
                // We use the step that caused the interrupt to determine where to resume.
                let resume_state = if let Some(step_id) = interrupt.run_step_id {
                    if let Some(step) = self.step_repo.get(step_id).await? {
                        crate::step_engine::step_key_to_run_state(step.step_key)
                    } else {
                        RunState::Queued
                    }
                } else {
                    RunState::Queued
                };

                run.transition_to(resume_state)
                    .context("cannot transition run to resume state")?;
                run.error_message = None;
                self.run_repo.update(&run).await?;

                self.emit(
                    run.id,
                    None,
                    EventKind::StateChange,
                    EventLevel::Info,
                    format!("run state → {resume_state} (continue with note: {note})"),
                )
                .await;

                info!(run_id = %run.id, "run continued after interrupt with note");
            }
            InterruptAction::AbortRun => {
                run.transition_to(RunState::Cancelled)
                    .context("cannot transition run to cancelled")?;
                self.run_repo.update(&run).await?;

                self.emit(
                    run.id,
                    None,
                    EventKind::StateChange,
                    EventLevel::Info,
                    "run state → cancelled (aborted by human)".into(),
                )
                .await;

                info!(run_id = %run.id, "run aborted after interrupt");
            }
        }

        Ok(())
    }

    async fn emit(
        &self,
        run_id: RunId,
        step_id: Option<StepId>,
        kind: EventKind,
        level: EventLevel,
        message: String,
    ) {
        let event = RunEvent::new(run_id, step_id, kind, level, message);
        if let Err(e) = self.event_repo.insert(&event).await {
            tracing::warn!("failed to emit event: {e}");
        }
    }
}

fn action_label(action: &InterruptAction) -> &'static str {
    match action {
        InterruptAction::RetryStep => "retry_step",
        InterruptAction::ContinueWithNote { .. } => "continue_with_note",
        InterruptAction::AbortRun => "abort_run",
    }
}
