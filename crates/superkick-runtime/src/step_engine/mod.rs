//! Step engine — executes a run's playbook as a sequence of typed steps.
//!
//! Takes a `Run` in `Queued` state and drives it through: Prepare → workflow
//! steps from config → Completed (or Failed on error). Each step is persisted,
//! events are emitted, and the run state machine is advanced at every boundary.

mod agent;
pub(crate) mod budget;
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
    AgentCatalog, AttentionKind, AttentionReply, AttentionRequest, AttentionRequestId,
    AttentionStatus, EventKind, EventLevel, ExecutionMode, InterruptAction, PauseKind, RoleRouter,
    RunBudgetGrant, RunEvent, RunPolicy, RunState, RunStep, StepKey, StepStatus,
};
use superkick_storage::repo::{
    AgentSessionRepo, ArtifactRepo, AttentionRequestRepo, InterruptRepo, InterruptTxRepo,
    RunEventRepo, RunRepo, RunStepRepo, TranscriptRepo,
};

use crate::agent_supervisor::AgentSupervisor;
use crate::interrupt_service::InterruptService;
use crate::pty_session::PtySessionRegistry;
use crate::repo_cache::RepoCache;
use crate::session_bus::SessionBus;

/// Default agent timeout (10 minutes).
const DEFAULT_AGENT_TIMEOUT: Duration = Duration::from_secs(600);

/// How often the step engine re-reads the DB while waiting for an operator
/// to resolve an interrupt / attention request. Shortened under `cfg(test)`
/// so gate tests finish in tens of milliseconds rather than multi-second
/// increments.
#[cfg(not(test))]
const GATE_POLL_INTERVAL: Duration = Duration::from_secs(2);
#[cfg(test)]
const GATE_POLL_INTERVAL: Duration = Duration::from_millis(25);

/// Drives a single run through its typed step sequence.
pub struct StepEngine<R, ST, E, A, AR, I, AT, T = ()> {
    run_repo: Arc<R>,
    step_repo: Arc<ST>,
    event_repo: Arc<E>,
    interrupt_repo: Arc<I>,
    artifact_repo: Arc<AR>,
    attention_repo: Arc<AT>,
    supervisor: AgentSupervisor<A, E, T>,
    interrupt_service: InterruptService<R, E, I>,
    repo_cache: RepoCache,
    config: SuperkickConfig,
    catalog: AgentCatalog,
    policy: RunPolicy,
    linear_client: OptionalLinearClient,
}

pub struct StepEngineDeps<R, ST, E, A, AR, I, AT, T = ()> {
    pub run_repo: Arc<R>,
    pub step_repo: Arc<ST>,
    pub event_repo: Arc<E>,
    pub session_repo: Arc<A>,
    pub artifact_repo: Arc<AR>,
    pub interrupt_repo: Arc<I>,
    pub attention_repo: Arc<AT>,
    pub transcript_repo: Arc<T>,
    pub registry: Arc<PtySessionRegistry>,
    pub repo_cache: RepoCache,
    pub config: SuperkickConfig,
    /// Shared Linear client, when `LINEAR_API_KEY` is configured. Used to
    /// build per-run `IssueContext` snapshots for child agent roles (SUP-86).
    /// `None` disables snapshot + MCP delivery — roles configured for it
    /// downgrade to `none` with a warning.
    pub linear_client: OptionalLinearClient,
    /// Workspace-shared session lifecycle bus (SUP-84). When provided the
    /// engine's supervisor publishes every session phase transition here so
    /// shell-level subscribers can observe spawn-and-observe activity across
    /// runs. `None` preserves the pre-SUP-84 behaviour for tests that do not
    /// exercise the substrate.
    pub session_bus: Option<Arc<SessionBus>>,
}

impl<R, ST, E, A, AR, I, AT, T> StepEngine<R, ST, E, A, AR, I, AT, T>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    AR: ArtifactRepo + 'static,
    I: InterruptRepo + InterruptTxRepo + 'static,
    AT: AttentionRequestRepo + 'static,
    T: TranscriptRepo + 'static,
{
    pub fn new(deps: StepEngineDeps<R, ST, E, A, AR, I, AT, T>) -> Self {
        let mut supervisor = AgentSupervisor::new(
            deps.session_repo,
            Arc::clone(&deps.event_repo),
            deps.transcript_repo,
            deps.registry,
        );
        if let Some(bus) = deps.session_bus {
            supervisor = supervisor.with_lifecycle_bus(bus);
        }
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
            attention_repo: deps.attention_repo,
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
        // Token aggregation is not wired up yet (SUP-72 risk 1). Surface the
        // misconfiguration once at run start so an operator who configured
        // `token_ceiling` doesn't silently believe it's enforced.
        if run.budget.token_ceiling.is_some() {
            warn!(
                run_id = %run.id,
                "budget.token_ceiling configured but no integration reports tokens — dimension is skipped (SUP-72 risk 1)"
            );
        }

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

            // SUP-72: Run-level gate. Enforces budget tripwires and
            // approval checkpoints before the step transitions. Returns
            // `Terminated` when the operator aborts or rejects approval —
            // the run is already transitioned to its terminal state by then.
            if let GateDecision::Terminated =
                self.pre_step_gate(run, step_key, cancel_token).await?
            {
                abort_setup_handle(&mut setup_handle).await;
                return Ok(());
            }

            let run_state = step_key_to_run_state(step_key);

            'step_retry: loop {
                let state_changed = if run.state != run_state {
                    if let Err(e) = run.transition_to(run_state) {
                        self.fail_run(run, format!("invalid transition: {e}"))
                            .await?;
                        abort_setup_handle(&mut setup_handle).await;
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
                        Some(BlockedAction::Abort) => {
                            abort_setup_handle(&mut setup_handle).await;
                            return Ok(());
                        }
                        None => {}
                    }
                }

                self.fail_run(run, error_msg).await?;
                abort_setup_handle(&mut setup_handle).await;
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

    /// SUP-72 gate. Enforces the run's budget contract and approval
    /// checkpoints before a step is allowed to execute. Pauses the run via
    /// `WaitingHuman` and blocks until the operator resolves the gate:
    ///
    /// * **Budget trip** → interrupt flow (override / abort). On override the
    ///   run resumes at the gated step; on abort it transitions to Cancelled.
    /// * **Approval checkpoint** → `AttentionRequest` of kind `approval`.
    ///   `approved=true` resumes, `approved=false` fails the run with the
    ///   operator's reason.
    async fn pre_step_gate(
        &self,
        run: &mut superkick_core::Run,
        step_key: StepKey,
        cancel_token: &CancellationToken,
    ) -> Result<GateDecision> {
        // 1. Budget tripwires
        let snapshot = self.build_budget_snapshot(run).await?;
        if let Some(trip) = budget::evaluate(&run.budget, &snapshot, &run.budget_grant) {
            match self
                .handle_budget_trip(run, step_key, trip, snapshot, cancel_token)
                .await?
            {
                GateDecision::Terminated => return Ok(GateDecision::Terminated),
                GateDecision::Continue => {}
            }
        }

        // 2. Approval checkpoints
        if self
            .config
            .orchestration
            .approval_checkpoints
            .contains(&step_key)
        {
            return self
                .handle_approval_checkpoint(run, step_key, cancel_token)
                .await;
        }

        Ok(GateDecision::Continue)
    }

    async fn build_budget_snapshot(
        &self,
        run: &superkick_core::Run,
    ) -> Result<budget::BudgetSnapshot> {
        let steps = self.step_repo.list_by_run(run.id).await?;
        // Retries observed: sum of `attempt - 1` across every run step —
        // every retry attempt represents one unit of cumulative retry cost.
        let retries_observed: u32 = steps.iter().map(|s| s.attempt.saturating_sub(1)).sum();
        Ok(budget::BudgetSnapshot {
            now: Utc::now(),
            started_at: run.started_at,
            retries_observed,
            // Token aggregation is deferred until integrations report usage
            // uniformly (SUP-72 risk 1). `None` means "skip the tokens
            // dimension" rather than "zero tokens observed".
            tokens_observed: None,
        })
    }

    /// Convert a snapshot to `RunBudgetGrant` offsets, used to mark "operator
    /// acknowledged the current observed values" so the next gate doesn't
    /// re-trip on the same counters.
    fn snapshot_to_grant(snapshot: &budget::BudgetSnapshot) -> RunBudgetGrant {
        let elapsed = snapshot
            .now
            .signed_duration_since(snapshot.started_at)
            .num_seconds()
            .max(0) as u64;
        RunBudgetGrant {
            duration_secs: elapsed,
            retries: snapshot.retries_observed,
            tokens: snapshot.tokens_observed.unwrap_or(0),
        }
    }

    async fn handle_budget_trip(
        &self,
        run: &mut superkick_core::Run,
        step_key: StepKey,
        trip: budget::BudgetTrip,
        snapshot: budget::BudgetSnapshot,
        cancel_token: &CancellationToken,
    ) -> Result<GateDecision> {
        let reason = trip.reason();
        info!(
            run_id = %run.id,
            dimension = trip.dimension.as_str(),
            observed = trip.observed,
            limit = trip.limit,
            "budget tripwire tripped"
        );

        // Structured trip event (payload is consumed by the UI to render the
        // pause banner without re-parsing `reason`).
        self.emit_with_payload(
            run,
            None,
            EventKind::BudgetTripped,
            EventLevel::Warn,
            format!("budget tripwire: {reason}"),
            serde_json::json!({
                "dimension": trip.dimension.as_str(),
                "observed": trip.observed,
                "limit": trip.limit,
            }),
        )
        .await;

        // Atomically update the run (pause metadata + state) alongside the
        // interrupt insert so a crash between the two can't produce a
        // "waiting-human without interrupt" orphan.
        run.mark_paused(PauseKind::Budget, &reason);
        run.transition_to(RunState::WaitingHuman)
            .context("cannot transition to waiting_human for budget gate")?;
        let interrupt = superkick_core::Interrupt::new(
            run.id,
            None,
            format!("Budget tripped: {reason}. Override and continue, or abort the run?"),
        );
        self.interrupt_repo
            .create_interrupt_atomic(run, &interrupt)
            .await
            .context("failed to create budget-gate interrupt")?;

        self.emit(
            run,
            None,
            EventKind::StateChange,
            EventLevel::Info,
            format!("run state → waiting_human (budget: {reason})"),
        )
        .await;
        self.emit(
            run,
            None,
            EventKind::InterruptCreated,
            EventLevel::Warn,
            format!("interrupt created: {}", interrupt.question),
        )
        .await;

        let action = self.wait_for_interrupt(interrupt.id, cancel_token).await?;

        match action {
            InterruptAction::RetryStep | InterruptAction::ContinueWithNote { .. } => {
                info!(run_id = %run.id, "operator overrode budget trip; resuming");
                if let InterruptAction::ContinueWithNote { note } = &action {
                    run.append_operator_note("budget override", note);
                }
                // Snapshot the observed values so the next gate's `evaluate`
                // doesn't re-trip on the same counters — without this the
                // override would loop forever.
                run.budget_grant = Self::snapshot_to_grant(&snapshot);
                run.clear_pause();
                let next_state = step_key_to_run_state(step_key);
                run.transition_to(next_state)
                    .context("failed to resume after budget override")?;
                run.current_step_key = Some(step_key);
                self.run_repo.update(run).await?;
                self.emit(
                    run,
                    None,
                    EventKind::StateChange,
                    EventLevel::Info,
                    format!("run state → {next_state} (budget override)"),
                )
                .await;
                Ok(GateDecision::Continue)
            }
            InterruptAction::AbortRun => {
                info!(run_id = %run.id, "operator aborted run at budget tripwire");
                // Keep the pause metadata on the run so the dashboard can
                // still surface *why* the run is terminal — same policy as
                // approval rejection at the checkpoint below.
                run.transition_to(RunState::Cancelled)
                    .context("failed to cancel after budget abort")?;
                run.current_step_key = None;
                self.run_repo.update(run).await?;
                self.emit(
                    run,
                    None,
                    EventKind::StateChange,
                    EventLevel::Info,
                    "run state → cancelled (budget abort)".into(),
                )
                .await;
                Ok(GateDecision::Terminated)
            }
        }
    }

    async fn handle_approval_checkpoint(
        &self,
        run: &mut superkick_core::Run,
        step_key: StepKey,
        cancel_token: &CancellationToken,
    ) -> Result<GateDecision> {
        info!(run_id = %run.id, step = %step_key, "entering approval checkpoint");

        let title = format!("Approval required before {step_key}");
        let body = format!(
            "Step `{step_key}` is in `approval_checkpoints`. Approve to proceed, reject to fail the run."
        );
        let request =
            AttentionRequest::new(run.id, AttentionKind::Approval, title.clone(), body, None)
                .context("failed to build approval attention request")?;
        self.attention_repo
            .insert(&request)
            .await
            .context("failed to insert approval attention request")?;

        // Structured checkpoint event; the generic attention_requested event
        // is emitted below so existing UI subscribers still refresh.
        self.emit_with_payload(
            run,
            None,
            EventKind::ApprovalGateEntered,
            EventLevel::Warn,
            format!("approval required before {step_key}"),
            serde_json::json!({
                "step_key": step_key.to_string(),
                "attention_request_id": request.id.0.to_string(),
            }),
        )
        .await;
        let mut arq_event = RunEvent::new(
            run.id,
            None,
            EventKind::AttentionRequested,
            EventLevel::Warn,
            format!("attention requested (Approval): {title}"),
        );
        arq_event.payload_json = serde_json::to_value(&request).ok();
        if let Err(e) = self.event_repo.insert(&arq_event).await {
            warn!("failed to emit attention_requested event: {e}");
        }

        let pause_reason = format!("awaiting approval before {step_key}");
        run.mark_paused(PauseKind::Approval, &pause_reason);
        run.transition_to(RunState::WaitingHuman)
            .context("cannot transition to waiting_human for approval gate")?;
        self.run_repo.update(run).await?;
        self.emit(
            run,
            None,
            EventKind::StateChange,
            EventLevel::Info,
            format!("run state → waiting_human ({pause_reason})"),
        )
        .await;

        let reply = self
            .wait_for_attention_reply(request.id, cancel_token)
            .await?;

        match reply {
            AttentionReply::Approval { approved: true, .. } => {
                info!(run_id = %run.id, step = %step_key, "approval granted");
                run.clear_pause();
                let next_state = step_key_to_run_state(step_key);
                run.transition_to(next_state)
                    .context("failed to resume after approval granted")?;
                run.current_step_key = Some(step_key);
                self.run_repo.update(run).await?;
                self.emit(
                    run,
                    None,
                    EventKind::StateChange,
                    EventLevel::Info,
                    format!("run state → {next_state} (checkpoint approved)"),
                )
                .await;
                Ok(GateDecision::Continue)
            }
            AttentionReply::Approval {
                approved: false,
                reason,
            } => {
                let reject_reason = reason.unwrap_or_else(|| "no reason provided".to_string());
                let error_msg =
                    format!("approval rejected at checkpoint {step_key}: {reject_reason}");
                info!(run_id = %run.id, step = %step_key, "operator rejected approval");
                // Keep the pause metadata on the run so the dashboard can
                // still surface *why* the run is terminal — see criterion 4.
                run.error_message = Some(error_msg.clone());
                run.transition_to(RunState::Failed)
                    .context("failed to transition to Failed after approval rejection")?;
                run.current_step_key = None;
                self.run_repo.update(run).await?;
                self.emit(
                    run,
                    None,
                    EventKind::StateChange,
                    EventLevel::Error,
                    format!("run state → failed ({error_msg})"),
                )
                .await;
                Ok(GateDecision::Terminated)
            }
            other => bail!("unexpected reply for approval request: {other:?}"),
        }
    }

    async fn wait_for_attention_reply(
        &self,
        request_id: AttentionRequestId,
        cancel_token: &CancellationToken,
    ) -> Result<AttentionReply> {
        poll_until(cancel_token, "approval", || async move {
            let Some(request) = self.attention_repo.get(request_id).await? else {
                return Ok(None);
            };
            if request.status != AttentionStatus::Replied {
                return Ok(None);
            }
            Ok(request.reply)
        })
        .await
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
                run.append_operator_note("semi-auto checkpoint", &note);
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
        poll_until(cancel_token, "human interrupt", || async move {
            let Some(interrupt) = self.interrupt_repo.get(interrupt_id).await? else {
                return Ok(None);
            };
            if interrupt.status != superkick_core::InterruptStatus::Resolved {
                return Ok(None);
            }
            let Some(answer) = interrupt.answer_json.as_ref() else {
                return Ok(None);
            };
            let action: InterruptAction = serde_json::from_value(answer.clone())
                .context("failed to parse interrupt action")?;
            Ok(Some(action))
        })
        .await
    }

    async fn fail_run(&self, run: &mut superkick_core::Run, message: String) -> Result<()> {
        warn!(run_id = %run.id, error = %message, "run failed");

        // Defensive: a concurrent cancellation may have already moved the run
        // to a terminal state before us. Treat that as success — the run is
        // already in its final state, and cascading the error would mask the
        // real terminal reason.
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

    async fn emit_with_payload(
        &self,
        run: &superkick_core::Run,
        step_id: Option<superkick_core::StepId>,
        kind: EventKind,
        level: EventLevel,
        message: String,
        payload: serde_json::Value,
    ) {
        let mut event = RunEvent::new(run.id, step_id, kind, level, message);
        event.payload_json = Some(payload);
        if let Err(e) = self.event_repo.insert(&event).await {
            warn!("failed to emit run event: {e}");
        }
    }
}

enum BlockedAction {
    Retry,
    Skip,
    Abort,
}

/// Outcome of `pre_step_gate`. `Continue` → the caller proceeds with step
/// execution; `Terminated` → the run has already been transitioned to a
/// terminal state (Cancelled/Failed) and the caller should unwind.
enum GateDecision {
    Continue,
    Terminated,
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

pub(super) async fn emit_event<E: RunEventRepo>(
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

/// Polls `f` every `GATE_POLL_INTERVAL` until it yields `Ok(Some(_))` or the
/// cancel token fires. `subject` is folded into the cancellation error message
/// so log readers can tell which gate was waiting.
async fn poll_until<T, F, Fut>(
    cancel_token: &CancellationToken,
    subject: &'static str,
    mut f: F,
) -> Result<T>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<Option<T>>>,
{
    loop {
        tokio::select! {
            _ = tokio::time::sleep(GATE_POLL_INTERVAL) => {}
            _ = cancel_token.cancelled() => {
                bail!("run cancelled while waiting for {subject}");
            }
        }
        if let Some(value) = f().await? {
            return Ok(value);
        }
    }
}

// ── SUP-72 gate tests ──────────────────────────────────────────────────
//
// Exercise `pre_step_gate` end-to-end against a real in-memory SQLite so the
// persistence + state transitions are covered the same way integration tests
// prove the storage layer. The step engine is instantiated with real repos
// and stubbed tool-dependent bits (no repo_cache clone, no agents declared).
// The gate path under test touches only the repos + config, so we can leave
// the rest of the engine surface alone.

#[cfg(test)]
mod gate_tests {
    use super::*;
    use std::collections::HashMap;
    use std::path::PathBuf;

    use superkick_config::{
        BudgetConfig, InterruptsConfig, IssueProvider, IssueSourceConfig, IssueTrigger,
        LaunchProfileConfig, OrchestrationConfig, RunnerConfig, RunnerMode, SuperkickConfig,
        WorkflowConfig,
    };
    use superkick_core::{
        AttentionKind, AttentionReply, ExecutionMode, PauseKind, Run, RunBudget, RunState, RunStep,
        StepKey, TriggerSource,
    };
    use superkick_storage::repo::{AttentionRequestRepo, InterruptRepo, RunRepo, RunStepRepo};
    // `RunEventRepo` trait methods (`list_by_run`) must be in scope for
    // method resolution below — imported as an anonymous bound.
    #[allow(unused_imports)]
    use superkick_storage::repo::RunEventRepo;
    use superkick_storage::{
        SqliteAgentSessionRepo, SqliteArtifactRepo, SqliteAttentionRequestRepo,
        SqliteInterruptRepo, SqliteRunEventRepo, SqliteRunRepo, SqliteRunStepRepo,
        SqliteTranscriptRepo, connect_with_capacity,
    };

    type TestEngine = StepEngine<
        SqliteRunRepo,
        SqliteRunStepRepo,
        SqliteRunEventRepo,
        SqliteAgentSessionRepo,
        SqliteArtifactRepo,
        SqliteInterruptRepo,
        SqliteAttentionRequestRepo,
        SqliteTranscriptRepo,
    >;

    struct Harness {
        engine: Arc<TestEngine>,
        run_repo: Arc<SqliteRunRepo>,
        step_repo: Arc<SqliteRunStepRepo>,
        event_repo: Arc<SqliteRunEventRepo>,
        interrupt_repo: Arc<SqliteInterruptRepo>,
        attention_repo: Arc<SqliteAttentionRequestRepo>,
        tmp_cache: PathBuf,
        db_path: PathBuf,
    }

    impl Drop for Harness {
        fn drop(&mut self) {
            // Best-effort cleanup so /tmp doesn't accumulate stale gate
            // fixtures across CI runs. Errors here are non-fatal.
            let _ = std::fs::remove_dir_all(&self.tmp_cache);
            let _ = std::fs::remove_file(&self.db_path);
            let _ = std::fs::remove_file(self.db_path.with_extension("sqlite-shm"));
            let _ = std::fs::remove_file(self.db_path.with_extension("sqlite-wal"));
        }
    }

    fn mk_config(approval_checkpoints: Vec<StepKey>) -> SuperkickConfig {
        SuperkickConfig {
            version: 1,
            issue_source: IssueSourceConfig {
                provider: IssueProvider::Linear,
                trigger: IssueTrigger::InProgress,
            },
            runner: RunnerConfig {
                mode: RunnerMode::Local,
                repo_root: ".".into(),
                base_branch: "main".into(),
                worktree_prefix: "test".into(),
                setup_commands: vec![],
            },
            agents: HashMap::new(),
            workflow: WorkflowConfig { steps: vec![] },
            interrupts: InterruptsConfig::default(),
            budget: BudgetConfig::default(),
            launch_profile: LaunchProfileConfig::default(),
            orchestration: OrchestrationConfig {
                approval_checkpoints,
                ..Default::default()
            },
            recovery: Default::default(),
        }
    }

    async fn setup(config: SuperkickConfig) -> Harness {
        // Per-test temp file — SQLite `:memory:` isolates state per
        // connection so the concurrent "operator" spawned task would see an
        // empty DB. A real file sidesteps that; `Harness::drop` cleans up.
        let db_path =
            std::env::temp_dir().join(format!("superkick-gate-{}.sqlite", uuid::Uuid::new_v4()));
        let url = format!("sqlite:{}", db_path.display());
        let pool = connect_with_capacity(&url, 5)
            .await
            .expect("connect sqlite");
        let run_repo = Arc::new(SqliteRunRepo::new(pool.clone()));
        let step_repo = Arc::new(SqliteRunStepRepo::new(pool.clone()));
        let event_repo = Arc::new(SqliteRunEventRepo::new(pool.clone()));
        let session_repo = Arc::new(SqliteAgentSessionRepo::new(pool.clone()));
        let artifact_repo = Arc::new(SqliteArtifactRepo::new(pool.clone()));
        let interrupt_repo = Arc::new(SqliteInterruptRepo::new(pool.clone()));
        let attention_repo = Arc::new(SqliteAttentionRequestRepo::new(pool.clone()));
        let transcript_repo = Arc::new(SqliteTranscriptRepo::new(pool));
        let registry = Arc::new(crate::pty_session::PtySessionRegistry::new());

        let tmp = std::env::temp_dir().join(format!("superkick-gate-{}", uuid::Uuid::new_v4()));
        let repo_cache = crate::repo_cache::RepoCache::new(tmp.clone())
            .await
            .expect("repo cache init");

        let engine = Arc::new(StepEngine::new(StepEngineDeps {
            run_repo: Arc::clone(&run_repo),
            step_repo: Arc::clone(&step_repo),
            event_repo: Arc::clone(&event_repo),
            session_repo,
            artifact_repo,
            interrupt_repo: Arc::clone(&interrupt_repo),
            attention_repo: Arc::clone(&attention_repo),
            transcript_repo,
            registry,
            repo_cache,
            config,
            linear_client: None,
            session_bus: None,
        }));

        Harness {
            engine,
            run_repo,
            step_repo,
            event_repo,
            interrupt_repo,
            attention_repo,
            tmp_cache: tmp,
            db_path,
        }
    }

    async fn insert_run(repo: &SqliteRunRepo, budget: RunBudget) -> Run {
        let run = Run::new(
            "issue-1".into(),
            "SUP-TEST".into(),
            "owner/repo".into(),
            TriggerSource::Manual,
            ExecutionMode::FullAuto,
            "main".into(),
            false,
            None,
        )
        .with_budget(budget);
        repo.insert(&run).await.expect("insert run");
        run
    }

    /// Spin-wait for an interrupt on this run (pending), then resolve it with
    /// `action`. Used to simulate the operator pressing a button while the
    /// gate's poll loop is blocked.
    /// Poll for a pending interrupt and resolve it with `action`. Returns
    /// after the first update; the gate's own poll loop observes the status
    /// change on its next cycle. Bounded by `max_polls` so a mis-configured
    /// test fails fast instead of hanging the suite.
    async fn answer_interrupt_when_created(
        interrupt_repo: Arc<SqliteInterruptRepo>,
        run_id: superkick_core::RunId,
        action: superkick_core::InterruptAction,
    ) -> superkick_core::Interrupt {
        let max_polls = 200;
        for _ in 0..max_polls {
            let interrupts = interrupt_repo
                .list_by_run(run_id)
                .await
                .expect("list interrupts");
            if let Some(mut i) = interrupts
                .into_iter()
                .find(|i| i.status == superkick_core::InterruptStatus::Pending)
            {
                i.resolve(&action).expect("resolve interrupt");
                interrupt_repo.update(&i).await.expect("update interrupt");
                return i;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!(
            "no pending interrupt appeared within {} polls — gate likely didn't fire",
            max_polls
        );
    }

    async fn reply_attention_when_created(
        attention_repo: Arc<SqliteAttentionRequestRepo>,
        run_id: superkick_core::RunId,
        reply: AttentionReply,
    ) {
        let max_polls = 200;
        for _ in 0..max_polls {
            let requests = attention_repo
                .list_by_run(run_id)
                .await
                .expect("list attention requests");
            if let Some(mut r) = requests
                .into_iter()
                .find(|r| r.status == superkick_core::AttentionStatus::Pending)
            {
                r.record_reply(reply, Some("tester".into()))
                    .expect("record reply");
                attention_repo.update(&r).await.expect("update attention");
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!(
            "no pending attention request appeared within {} polls — checkpoint didn't fire",
            max_polls
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn duration_tripwire_pauses_then_resumes_on_override() {
        let h = setup(mk_config(vec![])).await;
        // 1-second ceiling, artificially age `started_at` so the tripwire
        // fires on the very first gate check.
        let budget = RunBudget {
            duration_secs: Some(1),
            ..Default::default()
        };
        let mut run = insert_run(&h.run_repo, budget).await;
        run.started_at -= chrono::Duration::seconds(60);

        let cancel = CancellationToken::new();
        let interrupt_repo = Arc::clone(&h.interrupt_repo);
        let run_id = run.id;
        let answer = tokio::spawn(answer_interrupt_when_created(
            interrupt_repo,
            run_id,
            superkick_core::InterruptAction::RetryStep,
        ));

        let decision = h
            .engine
            .pre_step_gate(&mut run, StepKey::Plan, &cancel)
            .await
            .expect("gate completes");
        answer.await.unwrap();

        assert!(matches!(decision, GateDecision::Continue));
        let persisted = h.run_repo.get(run.id).await.unwrap().unwrap();
        assert_eq!(persisted.state, RunState::Planning);
        assert_eq!(persisted.pause_kind, PauseKind::None);
        assert!(persisted.pause_reason.is_none());

        // A budget_tripped event was recorded.
        let events = h.event_repo.list_by_run(run.id).await.unwrap();
        assert!(
            events.iter().any(|e| e.kind == EventKind::BudgetTripped),
            "expected a budget_tripped event"
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn retries_tripwire_pauses_run() {
        let h = setup(mk_config(vec![])).await;
        let budget = RunBudget {
            retries_max: Some(1),
            ..Default::default()
        };
        let mut run = insert_run(&h.run_repo, budget).await;

        // Seed two step rows so cumulative retries = 2 (attempts 2 each means 1
        // retry each, total 2 > limit 1).
        for _ in 0..2 {
            let mut step = RunStep::new(run.id, StepKey::Code, 2);
            step.status = superkick_core::StepStatus::Succeeded;
            h.step_repo.insert(&step).await.unwrap();
        }

        let cancel = CancellationToken::new();
        let interrupt_repo = Arc::clone(&h.interrupt_repo);
        let answer = tokio::spawn(answer_interrupt_when_created(
            interrupt_repo,
            run.id,
            superkick_core::InterruptAction::AbortRun,
        ));

        let decision = h
            .engine
            .pre_step_gate(&mut run, StepKey::Plan, &cancel)
            .await
            .expect("gate completes");
        answer.await.unwrap();

        assert!(matches!(decision, GateDecision::Terminated));
        let persisted = h.run_repo.get(run.id).await.unwrap().unwrap();
        assert_eq!(persisted.state, RunState::Cancelled);

        // Verify the trip event payload mentions the retries dimension.
        let events = h.event_repo.list_by_run(run.id).await.unwrap();
        let trip = events
            .iter()
            .find(|e| e.kind == EventKind::BudgetTripped)
            .expect("budget_tripped event missing");
        let payload = trip.payload_json.as_ref().expect("trip payload");
        assert_eq!(
            payload.get("dimension").and_then(|v| v.as_str()),
            Some("retries")
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn approval_checkpoint_blocks_then_resumes_on_approve() {
        let h = setup(mk_config(vec![StepKey::Code])).await;
        let mut run = insert_run(&h.run_repo, RunBudget::default()).await;

        let cancel = CancellationToken::new();
        let attention_repo = Arc::clone(&h.attention_repo);
        let reply = tokio::spawn(reply_attention_when_created(
            attention_repo,
            run.id,
            AttentionReply::Approval {
                approved: true,
                reason: Some("LGTM".into()),
            },
        ));

        let decision = h
            .engine
            .pre_step_gate(&mut run, StepKey::Code, &cancel)
            .await
            .expect("gate completes");
        reply.await.unwrap();

        assert!(matches!(decision, GateDecision::Continue));
        let persisted = h.run_repo.get(run.id).await.unwrap().unwrap();
        assert_eq!(persisted.state, RunState::Coding);
        assert_eq!(persisted.pause_kind, PauseKind::None);

        // Approval request persisted + resolved as approved.
        let requests = h.attention_repo.list_by_run(run.id).await.unwrap();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].kind, AttentionKind::Approval);
        assert!(matches!(
            requests[0].reply,
            Some(AttentionReply::Approval { approved: true, .. })
        ));

        // An approval_gate_entered event was recorded.
        let events = h.event_repo.list_by_run(run.id).await.unwrap();
        assert!(
            events
                .iter()
                .any(|e| e.kind == EventKind::ApprovalGateEntered),
            "expected an approval_gate_entered event"
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn approval_checkpoint_rejection_fails_run_with_reason() {
        let h = setup(mk_config(vec![StepKey::Code])).await;
        let mut run = insert_run(&h.run_repo, RunBudget::default()).await;

        let cancel = CancellationToken::new();
        let attention_repo = Arc::clone(&h.attention_repo);
        let reply = tokio::spawn(reply_attention_when_created(
            attention_repo,
            run.id,
            AttentionReply::Approval {
                approved: false,
                reason: Some("insufficient context".into()),
            },
        ));

        let decision = h
            .engine
            .pre_step_gate(&mut run, StepKey::Code, &cancel)
            .await
            .expect("gate completes");
        reply.await.unwrap();

        assert!(matches!(decision, GateDecision::Terminated));
        let persisted = h.run_repo.get(run.id).await.unwrap().unwrap();
        assert_eq!(persisted.state, RunState::Failed);
        let err = persisted
            .error_message
            .as_deref()
            .expect("error_message populated on rejection");
        assert!(
            err.contains("insufficient context"),
            "error_message must echo the operator's reason: got {err:?}"
        );
        assert!(err.contains("code"), "error_message must mention the step");
    }
}
