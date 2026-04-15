//! Step engine — executes a run's playbook as a sequence of typed steps.
//!
//! Takes a `Run` in `Queued` state and drives it through: Prepare → workflow
//! steps from config → Completed (or Failed on error). Each step is persisted,
//! events are emitted, and the run state machine is advanced at every boundary.

mod agent;
mod commands;
mod create_pr;
mod prepare;
mod review_swarm;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use chrono::Utc;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

use crate::linear_context::OptionalLinearClient;
use superkick_config::{InterruptPolicy, SuperkickConfig, WorkflowStep};
use superkick_core::{
    AgentCatalog, EventKind, EventLevel, ExecutionMode, InterruptAction, RoleRouter, RunEvent,
    RunPolicy, RunState, RunStep, StepKey, StepStatus,
};
use superkick_storage::repo::{
    AgentSessionRepo, ArtifactRepo, InterruptRepo, InterruptTxRepo, RunEventRepo, RunRepo,
    RunStepRepo, TranscriptRepo,
};

use crate::agent_supervisor::AgentSupervisor;
use crate::interrupt_service::InterruptService;
use crate::pty_session::PtySessionRegistry;
use crate::repo_cache::RepoCache;

/// Default agent timeout (10 minutes).
const DEFAULT_AGENT_TIMEOUT: Duration = Duration::from_secs(600);

/// Drives a single run through its typed step sequence.
pub struct StepEngine<R, ST, E, A, AR, I, T = ()> {
    run_repo: Arc<R>,
    step_repo: Arc<ST>,
    event_repo: Arc<E>,
    interrupt_repo: Arc<I>,
    artifact_repo: Arc<AR>,
    supervisor: AgentSupervisor<A, E, T>,
    interrupt_service: InterruptService<R, E, I>,
    repo_cache: RepoCache,
    config: SuperkickConfig,
    catalog: AgentCatalog,
    policy: RunPolicy,
    linear_client: OptionalLinearClient,
}

pub struct StepEngineDeps<R, ST, E, A, AR, I, T = ()> {
    pub run_repo: Arc<R>,
    pub step_repo: Arc<ST>,
    pub event_repo: Arc<E>,
    pub session_repo: Arc<A>,
    pub artifact_repo: Arc<AR>,
    pub interrupt_repo: Arc<I>,
    pub transcript_repo: Arc<T>,
    pub registry: Arc<PtySessionRegistry>,
    pub repo_cache: RepoCache,
    pub config: SuperkickConfig,
    /// Shared Linear client, when `LINEAR_API_KEY` is configured. Used to
    /// build per-run `IssueContext` snapshots for child agent roles (SUP-86).
    /// `None` disables snapshot + MCP delivery — roles configured for it
    /// downgrade to `none` with a warning.
    pub linear_client: OptionalLinearClient,
}

impl<R, ST, E, A, AR, I, T> StepEngine<R, ST, E, A, AR, I, T>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    AR: ArtifactRepo + 'static,
    I: InterruptRepo + InterruptTxRepo + 'static,
    T: TranscriptRepo + 'static,
{
    pub fn new(deps: StepEngineDeps<R, ST, E, A, AR, I, T>) -> Self {
        let supervisor = AgentSupervisor::new(
            deps.session_repo,
            Arc::clone(&deps.event_repo),
            deps.transcript_repo,
            deps.registry,
        );
        let interrupt_service = InterruptService::new(
            Arc::clone(&deps.run_repo),
            Arc::clone(&deps.event_repo),
            Arc::clone(&deps.interrupt_repo),
        );
        let catalog = deps.config.agent_catalog();
        let policy = deps.config.base_run_policy();
        Self {
            run_repo: deps.run_repo,
            step_repo: deps.step_repo,
            event_repo: deps.event_repo,
            interrupt_repo: deps.interrupt_repo,
            artifact_repo: deps.artifact_repo,
            supervisor,
            interrupt_service,
            repo_cache: deps.repo_cache,
            config: deps.config,
            catalog,
            policy,
            linear_client: deps.linear_client,
        }
    }

    /// Shared Linear client used for snapshot delivery. `None` when
    /// `LINEAR_API_KEY` is not configured.
    pub(crate) fn linear_client(
        &self,
    ) -> Option<&Arc<superkick_integrations::linear::LinearClient>> {
        self.linear_client.as_ref()
    }

    /// Construct a run-scoped router. Every agent spawn must flow through
    /// this — the router enforces the project catalog + run policy.
    pub(crate) fn router(&self) -> RoleRouter<'_> {
        RoleRouter::new(&self.catalog, &self.policy)
    }

    /// Execute the full run lifecycle: Queued → steps → Completed/Failed.
    pub async fn execute(
        &self,
        mut run: superkick_core::Run,
        cancel_token: CancellationToken,
    ) -> Result<()> {
        if let Err(err) = self.preflight_check(&run).await {
            self.fail_run(&mut run, format!("preflight failed: {err:#}"))
                .await?;
            self.cleanup_worktree(&run).await;
            return Ok(());
        }

        let result = self.execute_inner(&mut run, &cancel_token).await;

        if run.state.is_terminal() {
            self.cleanup_worktree(&run).await;
        }

        result
    }

    /// Inner execution loop, separated so cleanup runs regardless of outcome.
    async fn execute_inner(
        &self,
        run: &mut superkick_core::Run,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
        let step_keys = self.build_step_plan();
        let mut setup_handle: Option<tokio::task::JoinHandle<Result<()>>> = None;

        for step_key in step_keys {
            if cancel_token.is_cancelled() {
                abort_setup_handle(&mut setup_handle).await;
                self.handle_cancellation(run).await?;
                return Ok(());
            }

            if step_key == StepKey::Code {
                if let Some(handle) = setup_handle.take() {
                    handle.await.context("setup task panicked")??;
                }

                // Semi-auto: pause before coding to let the operator review the plan.
                if run.execution_mode == ExecutionMode::SemiAuto {
                    if let Some(BlockedAction::Abort) =
                        self.handle_semi_auto_checkpoint(run, cancel_token).await?
                    {
                        return Ok(());
                    }
                }
            }

            let run_state = step_key_to_run_state(step_key);

            'step_retry: loop {
                let state_changed = if run.state != run_state {
                    if let Err(e) = run.transition_to(run_state) {
                        self.fail_run(run, format!("invalid transition: {e}"))
                            .await?;
                        return Ok(());
                    }
                    true
                } else {
                    false
                };

                run.current_step_key = Some(step_key);
                self.run_repo.update(run).await?;

                if state_changed {
                    self.emit(
                        run,
                        None,
                        EventKind::StateChange,
                        EventLevel::Info,
                        format!("run state → {run_state}"),
                    )
                    .await;
                }

                let mut step = RunStep::new(run.id, step_key, 1);
                self.step_repo.insert(&step).await?;

                let max_attempts = self.config.budget.max_retries_per_step + 1;
                let mut succeeded = false;

                for attempt in 1..=max_attempts {
                    step.attempt = attempt;
                    step.status = StepStatus::Running;
                    step.started_at = Some(Utc::now());
                    step.error_message = None;
                    self.step_repo.update(&step).await?;

                    self.emit(
                        run,
                        Some(step.id),
                        EventKind::StepStarted,
                        EventLevel::Info,
                        format!("step {step_key} started (attempt {attempt}/{max_attempts})"),
                    )
                    .await;

                    let worktree_path = run.worktree_path.as_deref().map(PathBuf::from);

                    match self
                        .execute_step(step_key, run, &step, worktree_path.as_deref(), cancel_token)
                        .await
                    {
                        Ok(()) => {
                            step.status = StepStatus::Succeeded;
                            step.finished_at = Some(Utc::now());
                            self.step_repo.update(&step).await?;

                            self.emit(
                                run,
                                Some(step.id),
                                EventKind::StepCompleted,
                                EventLevel::Info,
                                format!("step {step_key} completed"),
                            )
                            .await;

                            if step_key == StepKey::Prepare
                                && !self.config.runner.setup_commands.is_empty()
                            {
                                setup_handle = Some(self.spawn_setup_commands(run, cancel_token)?);
                            }

                            succeeded = true;
                            break;
                        }
                        Err(e) => {
                            if cancel_token.is_cancelled() {
                                step.status = StepStatus::Failed;
                                step.finished_at = Some(Utc::now());
                                step.error_message = Some("cancelled".into());
                                self.step_repo.update(&step).await?;

                                abort_setup_handle(&mut setup_handle).await;
                                self.handle_cancellation(run).await?;
                                return Ok(());
                            }

                            let msg = format!("{e:#}");
                            step.status = StepStatus::Failed;
                            step.finished_at = Some(Utc::now());
                            step.error_message = Some(msg.clone());
                            self.step_repo.update(&step).await?;

                            self.emit(
                                run,
                                Some(step.id),
                                EventKind::StepFailed,
                                EventLevel::Error,
                                format!(
                                    "step {step_key} failed (attempt {attempt}/{max_attempts}): {msg}"
                                ),
                            )
                            .await;

                            if attempt < max_attempts {
                                info!(
                                    step = %step_key,
                                    attempt,
                                    "retrying step after failure"
                                );
                            }
                        }
                    }
                }

                if succeeded {
                    break;
                }

                let error_msg = format!(
                    "step {step_key} failed after {max_attempts} attempt(s): {}",
                    step.error_message.as_deref().unwrap_or("unknown")
                );

                if self.interrupt_policy_for_step(step_key) == InterruptPolicy::AskHuman {
                    let action = self
                        .handle_blocked_step(
                            run,
                            &step,
                            step_key,
                            max_attempts,
                            run_state,
                            cancel_token,
                        )
                        .await?;

                    match action {
                        Some(BlockedAction::Retry) => continue 'step_retry,
                        Some(BlockedAction::Skip) => break 'step_retry,
                        Some(BlockedAction::Abort) => return Ok(()),
                        None => {}
                    }
                }

                self.fail_run(run, error_msg).await?;
                return Ok(());
            }
        }

        run.transition_to(RunState::Completed)
            .context("failed to transition to Completed")?;
        run.current_step_key = None;
        self.run_repo.update(run).await?;
        self.emit(
            run,
            None,
            EventKind::StateChange,
            EventLevel::Info,
            "run completed".into(),
        )
        .await;

        info!(run_id = %run.id, "run completed successfully");
        Ok(())
    }

    // ── internals ──────────────────────────────────────────────────────

    fn build_step_plan(&self) -> Vec<StepKey> {
        let mut keys = vec![StepKey::Prepare];
        for ws in &self.config.workflow.steps {
            match ws {
                WorkflowStep::Plan { .. } => keys.push(StepKey::Plan),
                WorkflowStep::Code { .. } => keys.push(StepKey::Code),
                WorkflowStep::Commands { .. } => keys.push(StepKey::Commands),
                WorkflowStep::ReviewSwarm { .. } => keys.push(StepKey::ReviewSwarm),
                WorkflowStep::Pr { .. } => keys.push(StepKey::CreatePr),
            }
        }
        keys
    }

    async fn execute_step(
        &self,
        key: StepKey,
        run: &mut superkick_core::Run,
        step: &RunStep,
        worktree_path: Option<&std::path::Path>,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
        match key {
            StepKey::Prepare => self.execute_prepare(run).await,
            StepKey::Plan | StepKey::Code => {
                let wt = require_worktree(worktree_path)?;
                let agent_name = self.find_workflow_agent(key)?;
                self.execute_agent(run, step, &agent_name, wt, cancel_token)
                    .await
            }
            StepKey::Commands => {
                let wt = require_worktree(worktree_path)?;
                let commands = self.find_workflow_commands()?;
                self.execute_commands(run, step, &commands, wt, cancel_token)
                    .await
            }
            StepKey::CreatePr => {
                let wt = require_worktree(worktree_path)?;
                self.execute_create_pr(run, step, wt, cancel_token).await
            }
            StepKey::ReviewSwarm => {
                let wt = require_worktree(worktree_path)?;
                let (agents, threshold) = self.find_review_swarm_config()?;
                self.execute_review_swarm(run, step, &agents, threshold, wt, cancel_token)
                    .await
            }
            StepKey::AwaitHuman => Ok(()),
        }
    }

    async fn handle_cancellation(&self, run: &mut superkick_core::Run) -> Result<()> {
        info!(run_id = %run.id, "run cancelled");
        run.transition_to(RunState::Cancelled)
            .context("failed to transition to Cancelled")?;
        run.current_step_key = None;
        self.run_repo.update(run).await?;
        self.emit(
            run,
            None,
            EventKind::StateChange,
            EventLevel::Info,
            "run cancelled".into(),
        )
        .await;
        Ok(())
    }

    fn spawn_setup_commands(
        &self,
        run: &superkick_core::Run,
        cancel_token: &CancellationToken,
    ) -> Result<tokio::task::JoinHandle<Result<()>>> {
        let cmds: Vec<String> = self.config.runner.setup_commands.clone();
        let wt = PathBuf::from(
            run.worktree_path
                .as_deref()
                .context("worktree path missing after prepare step")?,
        );
        let run_id = run.id;
        let token = cancel_token.clone();
        Ok(tokio::spawn(async move {
            for cmd_str in &cmds {
                if token.is_cancelled() {
                    bail!("setup commands cancelled");
                }
                info!(
                    run_id = %run_id,
                    command = %cmd_str,
                    "running setup command (background)"
                );
                let mut child = Command::new("sh")
                    .args(["-c", cmd_str.as_str()])
                    .current_dir(&wt)
                    .stderr(std::process::Stdio::piped())
                    .spawn()
                    .with_context(|| format!("failed to spawn setup command: {cmd_str}"))?;

                // Drain stderr concurrently — must happen before wait() completes,
                // otherwise the pipe can close and the buffer is lost.
                let stderr_pipe = child.stderr.take();
                let stderr_task = tokio::spawn(async move {
                    let mut buf = Vec::new();
                    if let Some(mut s) = stderr_pipe {
                        let _ = s.read_to_end(&mut buf).await;
                    }
                    buf
                });

                let status = tokio::select! {
                    result = child.wait() => {
                        result.with_context(|| format!("failed to run setup command: {cmd_str}"))?
                    }
                    _ = token.cancelled() => {
                        kill_child(&mut child).await;
                        let _ = stderr_task.await;
                        bail!("setup command '{cmd_str}' cancelled");
                    }
                };

                if !status.success() {
                    let stderr_bytes = stderr_task.await.unwrap_or_default();
                    let stderr = String::from_utf8_lossy(&stderr_bytes);
                    bail!(
                        "setup command '{}' failed (exit {}): {}",
                        cmd_str,
                        status.code().unwrap_or(-1),
                        stderr.trim()
                    );
                }
            }
            Ok(())
        }))
    }

    async fn handle_blocked_step(
        &self,
        run: &mut superkick_core::Run,
        step: &RunStep,
        step_key: StepKey,
        max_attempts: u32,
        run_state: RunState,
        cancel_token: &CancellationToken,
    ) -> Result<Option<BlockedAction>> {
        let question = format!(
            "Step '{}' failed after {} attempt(s). How should we proceed?",
            step_key, max_attempts
        );
        let interrupt = self
            .interrupt_service
            .create_interrupt(run.id, Some(step.id), question)
            .await
            .context("failed to create interrupt")?;

        // Re-read run from DB to sync with the state set by InterruptService.
        if let Some(refreshed) = self.run_repo.get(run.id).await? {
            run.state = refreshed.state;
            run.updated_at = refreshed.updated_at;
        }

        let action = self.wait_for_interrupt(interrupt.id, cancel_token).await?;

        match action {
            InterruptAction::RetryStep => {
                info!(run_id = %run.id, "retrying step after interrupt");
                run.transition_to(run_state)
                    .context("failed to resume after retry")?;
                run.error_message = None;
                run.current_step_key = Some(step_key);
                self.run_repo.update(run).await?;
                self.emit(
                    run,
                    None,
                    EventKind::StateChange,
                    EventLevel::Info,
                    format!("run state → {run_state} (retrying after interrupt)"),
                )
                .await;
                Ok(Some(BlockedAction::Retry))
            }
            InterruptAction::ContinueWithNote { note } => {
                info!(run_id = %run.id, note = %note, "skipping step after interrupt");
                run.transition_to(run_state)
                    .context("failed to resume after continue")?;
                run.error_message = None;
                run.current_step_key = Some(step_key);
                self.run_repo.update(run).await?;
                self.emit(
                    run,
                    None,
                    EventKind::StateChange,
                    EventLevel::Info,
                    format!("run state → {run_state} (continue with note: {note})"),
                )
                .await;
                Ok(Some(BlockedAction::Skip))
            }
            InterruptAction::AbortRun => {
                info!(run_id = %run.id, "aborting run after interrupt");
                run.transition_to(RunState::Cancelled)
                    .context("failed to cancel after abort")?;
                run.current_step_key = None;
                self.run_repo.update(run).await?;
                self.emit(
                    run,
                    None,
                    EventKind::StateChange,
                    EventLevel::Info,
                    "run state → cancelled (aborted by human)".into(),
                )
                .await;
                Ok(Some(BlockedAction::Abort))
            }
        }
    }

    fn interrupt_policy_for_step(&self, key: StepKey) -> InterruptPolicy {
        match key {
            StepKey::ReviewSwarm => self.config.interrupts.on_review_conflict,
            _ => self.config.interrupts.on_blocked,
        }
    }

    /// In semi-auto mode, pause before coding to let the operator review the plan.
    /// Returns `Some(BlockedAction::Abort)` if the operator aborts, `None` otherwise.
    async fn handle_semi_auto_checkpoint(
        &self,
        run: &mut superkick_core::Run,
        cancel_token: &CancellationToken,
    ) -> Result<Option<BlockedAction>> {
        info!(run_id = %run.id, "semi-auto: pausing for operator review before coding");

        let question =
            "Plan complete. Review before coding starts. Continue, inject instructions, or abort?"
                .to_string();
        let interrupt = self
            .interrupt_service
            .create_interrupt(run.id, None, question)
            .await
            .context("failed to create semi-auto checkpoint interrupt")?;

        if let Some(refreshed) = self.run_repo.get(run.id).await? {
            run.state = refreshed.state;
            run.updated_at = refreshed.updated_at;
        }

        let action = self.wait_for_interrupt(interrupt.id, cancel_token).await?;

        match action {
            InterruptAction::AbortRun => {
                info!(run_id = %run.id, "semi-auto: operator aborted at checkpoint");
                run.transition_to(RunState::Cancelled)
                    .context("failed to cancel after semi-auto abort")?;
                run.current_step_key = None;
                self.run_repo.update(run).await?;
                self.emit(
                    run,
                    None,
                    EventKind::StateChange,
                    EventLevel::Info,
                    "run state → cancelled (operator aborted at semi-auto checkpoint)".into(),
                )
                .await;
                Ok(Some(BlockedAction::Abort))
            }
            InterruptAction::ContinueWithNote { note } => {
                info!(run_id = %run.id, note = %note, "semi-auto: operator approved with note");
                // Append note to operator_instructions so the coding agent sees it.
                let existing = run.operator_instructions.take().unwrap_or_default();
                let combined = if existing.is_empty() {
                    note
                } else {
                    format!("{existing}\n\n--- Operator note (semi-auto checkpoint) ---\n{note}")
                };
                run.operator_instructions = Some(combined);
                // Transition back from WaitingHuman to resume.
                run.transition_to(RunState::Coding)
                    .context("failed to resume after semi-auto continue")?;
                self.run_repo.update(run).await?;
                self.emit(
                    run,
                    None,
                    EventKind::StateChange,
                    EventLevel::Info,
                    "run state → coding (operator approved at semi-auto checkpoint)".into(),
                )
                .await;
                Ok(None)
            }
            InterruptAction::RetryStep => {
                info!(run_id = %run.id, "semi-auto: operator approved (continue)");
                run.transition_to(RunState::Coding)
                    .context("failed to resume after semi-auto retry")?;
                self.run_repo.update(run).await?;
                self.emit(
                    run,
                    None,
                    EventKind::StateChange,
                    EventLevel::Info,
                    "run state → coding (operator approved at semi-auto checkpoint)".into(),
                )
                .await;
                Ok(None)
            }
        }
    }

    fn find_workflow_agent(&self, key: StepKey) -> Result<String> {
        for ws in &self.config.workflow.steps {
            match (key, ws) {
                (StepKey::Plan, WorkflowStep::Plan { agent }) => return Ok(agent.clone()),
                (StepKey::Code, WorkflowStep::Code { agent }) => return Ok(agent.clone()),
                _ => {}
            }
        }
        bail!("no workflow step found for {key}")
    }

    fn find_workflow_commands(&self) -> Result<Vec<String>> {
        for ws in &self.config.workflow.steps {
            if let WorkflowStep::Commands { run } = ws {
                return Ok(run.clone());
            }
        }
        bail!("no Commands step found in workflow config")
    }

    async fn wait_for_interrupt(
        &self,
        interrupt_id: superkick_core::InterruptId,
        cancel_token: &CancellationToken,
    ) -> Result<InterruptAction> {
        loop {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(2)) => {}
                _ = cancel_token.cancelled() => {
                    bail!("run cancelled while waiting for human interrupt");
                }
            }

            if let Some(interrupt) = self.interrupt_repo.get(interrupt_id).await? {
                if interrupt.status == superkick_core::InterruptStatus::Resolved {
                    if let Some(answer) = &interrupt.answer_json {
                        let action: InterruptAction = serde_json::from_value(answer.clone())
                            .context("failed to parse interrupt action")?;
                        return Ok(action);
                    }
                }
            }
        }
    }

    async fn fail_run(&self, run: &mut superkick_core::Run, message: String) -> Result<()> {
        warn!(run_id = %run.id, error = %message, "run failed");

        if let Err(e) = run.transition_to(RunState::Failed) {
            warn!(run_id = %run.id, error = %e, "could not transition to Failed (already terminal)");
            return Ok(());
        }
        run.error_message = Some(message.clone());
        self.run_repo.update(run).await?;

        self.emit(
            run,
            None,
            EventKind::StateChange,
            EventLevel::Error,
            format!("run failed: {message}"),
        )
        .await;

        Ok(())
    }

    fn handoff_for_step(&self, key: StepKey) -> Option<&str> {
        let handoff = &self.config.launch_profile.handoff_instructions;
        if handoff.is_empty() {
            return None;
        }
        if key == StepKey::Code {
            Some(handoff.as_str())
        } else {
            None
        }
    }

    async fn emit(
        &self,
        run: &superkick_core::Run,
        step_id: Option<superkick_core::StepId>,
        kind: EventKind,
        level: EventLevel,
        message: String,
    ) {
        emit_event(&*self.event_repo, run.id, step_id, kind, level, message).await;
    }
}

enum BlockedAction {
    Retry,
    Skip,
    Abort,
}

// ── free functions ─────────────────────────────────────────────────────

pub fn step_key_to_run_state(key: StepKey) -> RunState {
    match key {
        StepKey::Prepare => RunState::Preparing,
        StepKey::Plan => RunState::Planning,
        StepKey::Code => RunState::Coding,
        StepKey::Commands => RunState::RunningCommands,
        StepKey::ReviewSwarm => RunState::Reviewing,
        StepKey::CreatePr => RunState::OpeningPr,
        StepKey::AwaitHuman => RunState::WaitingHuman,
    }
}

fn require_worktree(path: Option<&std::path::Path>) -> Result<&std::path::Path> {
    path.context("worktree path not set — Prepare step must run first")
}

async fn abort_setup_handle(handle: &mut Option<tokio::task::JoinHandle<Result<()>>>) {
    if let Some(h) = handle.take() {
        // The CancellationToken is already cancelled at this point — the spawned
        // task will see it in its select! and kill the child process. We just need
        // to wait for the task to finish cleanup. Do NOT call h.abort() as that
        // would bypass the token-based select! arm that calls kill_child().
        match h.await {
            Ok(Err(e)) => warn!("setup task failed during cancellation: {e:#}"),
            Err(e) if !e.is_cancelled() => warn!("setup task panicked: {e}"),
            _ => {}
        }
    }
}

pub(super) async fn kill_child(child: &mut tokio::process::Child) {
    if let Err(e) = child.kill().await {
        warn!("failed to kill child process: {e}");
    }
}

pub(super) fn build_full_prompt(
    base: &str,
    default_instructions: Option<&str>,
    per_run_instructions: Option<&str>,
    handoff_instructions: Option<&str>,
    role_system_prompt: Option<&str>,
    linear_context_block: Option<&str>,
) -> String {
    let mut parts = Vec::new();

    if let Some(sys) = role_system_prompt.filter(|s| !s.is_empty()) {
        parts.push(format!("--- Role system prompt ---\n{sys}\n\n"));
    }
    parts.push(base.to_string());

    if let Some(ctx) = linear_context_block.filter(|s| !s.is_empty()) {
        parts.push(format!("\n\n{ctx}"));
    }
    if let Some(defaults) = default_instructions {
        parts.push(format!(
            "\n\n--- Default operator instructions ---\n{defaults}"
        ));
    }
    if let Some(per_run) = per_run_instructions {
        parts.push(format!("\n\n--- Run-specific instructions ---\n{per_run}"));
    }
    if let Some(hoff) = handoff_instructions {
        parts.push(format!("\n\n--- Handoff instructions ---\n{hoff}"));
    }

    parts.join("")
}

async fn check_tool_exists(tool: &str) -> Result<()> {
    // We only care that the binary exists and is executable. Some CLIs exit
    // non-zero on `--version`, so we treat a successful spawn as sufficient.
    Command::new(tool)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .with_context(|| format!("`{tool}` not found on PATH"))?;
    Ok(())
}

async fn emit_event<E: RunEventRepo>(
    repo: &E,
    run_id: superkick_core::RunId,
    step_id: Option<superkick_core::StepId>,
    kind: EventKind,
    level: EventLevel,
    message: String,
) {
    let event = RunEvent::new(run_id, step_id, kind, level, message);
    if let Err(e) = repo.insert(&event).await {
        warn!("failed to emit run event: {e}");
    }
}
