//! Step engine — executes a run's playbook as a sequence of typed steps.
//!
//! Takes a `Run` in `Queued` state and drives it through: Prepare → workflow
//! steps from config → Completed (or Failed on error). Each step is persisted,
//! events are emitted, and the run state machine is advanced at every boundary.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use chrono::Utc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;
use tracing::{info, warn};

use superkick_config::InterruptPolicy;
use superkick_config::{SuperkickConfig, WorkflowStep};
use superkick_core::{
    AgentProvider, Artifact, ArtifactKind, EventKind, EventLevel, InterruptAction, RunEvent,
    RunState, RunStep, StepKey, StepStatus,
};
use superkick_storage::repo::{
    AgentSessionRepo, ArtifactRepo, InterruptRepo, RunEventRepo, RunRepo, RunStepRepo,
};

use crate::agent_supervisor::{AgentLaunchConfig, AgentSupervisor};
use crate::repo_cache::RepoCache;
use crate::worktree::{WorktreeInfo, WorktreeManager};

/// Default agent timeout (10 minutes).
const DEFAULT_AGENT_TIMEOUT: Duration = Duration::from_secs(600);

/// Drives a single run through its typed step sequence.
pub struct StepEngine<R, ST, E, A, AR, I> {
    run_repo: Arc<R>,
    step_repo: Arc<ST>,
    event_repo: Arc<E>,
    interrupt_repo: Arc<I>,
    artifact_repo: Arc<AR>,
    supervisor: AgentSupervisor<A, E>,
    repo_cache: RepoCache,
    config: SuperkickConfig,
}

pub struct StepEngineDeps<R, ST, E, A, AR, I> {
    pub run_repo: Arc<R>,
    pub step_repo: Arc<ST>,
    pub event_repo: Arc<E>,
    pub session_repo: Arc<A>,
    pub artifact_repo: Arc<AR>,
    pub interrupt_repo: Arc<I>,
    pub repo_cache: RepoCache,
    pub config: SuperkickConfig,
}

impl<R, ST, E, A, AR, I> StepEngine<R, ST, E, A, AR, I>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    AR: ArtifactRepo + 'static,
    I: InterruptRepo + 'static,
{
    pub fn new(deps: StepEngineDeps<R, ST, E, A, AR, I>) -> Self {
        let supervisor = AgentSupervisor::new(deps.session_repo, Arc::clone(&deps.event_repo));
        Self {
            run_repo: deps.run_repo,
            step_repo: deps.step_repo,
            event_repo: deps.event_repo,
            interrupt_repo: deps.interrupt_repo,
            artifact_repo: deps.artifact_repo,
            supervisor,
            repo_cache: deps.repo_cache,
            config: deps.config,
        }
    }

    /// Execute the full run lifecycle: Queued → steps → Completed/Failed.
    ///
    /// Worktrees are cleaned up on completion and failure. Interrupt paths
    /// (WaitingHuman) intentionally leave the worktree in place so a retry
    /// can resume from the same checkout.
    pub async fn execute(
        &self,
        mut run: superkick_core::Run,
        cancel_token: CancellationToken,
    ) -> Result<()> {
        // Preflight: verify required external tools are reachable.
        if let Err(err) = self.preflight_check(&run).await {
            self.fail_run(&mut run, format!("preflight failed: {err:#}"))
                .await?;
            self.cleanup_worktree(&run).await;
            return Ok(());
        }

        let result = self.execute_inner(&mut run, &cancel_token).await;

        // Cleanup worktree on terminal outcomes (Completed, Failed).
        // WaitingHuman keeps the worktree alive for potential retry.
        if run.state.is_terminal() || run.state == RunState::Failed {
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
        // Build the step plan: Prepare + workflow steps from config.
        let step_keys = self.build_step_plan();

        // Handle for setup commands running in background (spawned after Prepare).
        let mut setup_handle: Option<tokio::task::JoinHandle<Result<()>>> = None;

        for step_key in step_keys {
            // ── Cancellation check at step boundary ──
            if cancel_token.is_cancelled() {
                info!(run_id = %run.id, "run cancelled at step boundary");
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
                return Ok(());
            }

            // Before Code step, wait for setup commands to finish.
            if step_key == StepKey::Code {
                if let Some(handle) = setup_handle.take() {
                    handle.await.context("setup task panicked")??;
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

                // Create and persist the step.
                let mut step = RunStep::new(run.id, step_key, 1);
                self.step_repo.insert(&step).await?;

                // Execute with retries.
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

                            // After Prepare succeeds, spawn setup commands in background.
                            if step_key == StepKey::Prepare
                                && !self.config.runner.setup_commands.is_empty()
                            {
                                let cmds: Vec<String> = self.config.runner.setup_commands.clone();
                                let wt = PathBuf::from(
                                    run.worktree_path
                                        .as_deref()
                                        .context("worktree path missing after prepare step")?,
                                );
                                let run_id = run.id;
                                setup_handle = Some(tokio::spawn(async move {
                                    for cmd_str in &cmds {
                                        info!(
                                            run_id = %run_id,
                                            command = %cmd_str,
                                            "running setup command (background)"
                                        );
                                        let output = Command::new("sh")
                                            .args(["-c", cmd_str.as_str()])
                                            .current_dir(&wt)
                                            .output()
                                            .await
                                            .with_context(|| {
                                                format!("failed to run setup command: {cmd_str}")
                                            })?;
                                        if !output.status.success() {
                                            let stderr = String::from_utf8_lossy(&output.stderr);
                                            bail!(
                                                "setup command '{}' failed (exit {}): {}",
                                                cmd_str,
                                                output.status.code().unwrap_or(-1),
                                                stderr.trim()
                                            );
                                        }
                                    }
                                    Ok(())
                                }));
                            }

                            succeeded = true;
                            break;
                        }
                        Err(e) => {
                            // If cancelled, exit immediately — don't retry or create interrupts.
                            if cancel_token.is_cancelled() {
                                step.status = StepStatus::Failed;
                                step.finished_at = Some(Utc::now());
                                step.error_message = Some("cancelled".into());
                                self.step_repo.update(&step).await?;

                                info!(run_id = %run.id, "run cancelled during step {step_key}");
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

                // Check interrupt policy — if ask_human, pause with interrupt.
                if self.config.interrupts.on_blocked == InterruptPolicy::AskHuman {
                    let interrupt = superkick_core::Interrupt::new(
                        run.id,
                        Some(step.id),
                        format!(
                            "Step '{}' failed after {} attempt(s). How should we proceed?",
                            step_key, max_attempts
                        ),
                    );
                    self.interrupt_repo.insert(&interrupt).await?;

                    run.transition_to(RunState::WaitingHuman)
                        .context("failed to transition to WaitingHuman")?;
                    self.run_repo.update(run).await?;

                    self.emit(
                        run,
                        Some(step.id),
                        EventKind::StateChange,
                        EventLevel::Info,
                        "run state → waiting_human".into(),
                    )
                    .await;
                    self.emit(
                        run,
                        Some(step.id),
                        EventKind::InterruptCreated,
                        EventLevel::Warn,
                        format!("interrupt created: {error_msg}"),
                    )
                    .await;

                    info!(
                        run_id = %run.id,
                        interrupt_id = %interrupt.id,
                        "run paused for human interrupt"
                    );

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
                            continue 'step_retry;
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
                            break 'step_retry;
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
                            return Ok(());
                        }
                    }
                }

                self.fail_run(run, error_msg).await?;
                return Ok(());
            }
        }

        // All steps completed — transition to Completed.
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

    /// Verify that required external tools (git, gh, agent CLIs) are
    /// reachable before starting a run. Fails fast with an actionable
    /// error instead of dying mid-pipeline.
    async fn preflight_check(&self, run: &superkick_core::Run) -> Result<()> {
        // git is always required.
        check_tool_exists("git")
            .await
            .context("git is not installed or not on PATH — install it: https://git-scm.com")?;

        // Determine which agent CLIs the workflow will need.
        let mut needed_agents: std::collections::HashSet<&str> = std::collections::HashSet::new();
        for ws in &self.config.workflow.steps {
            match ws {
                WorkflowStep::Plan { agent } | WorkflowStep::Code { agent } => {
                    if let Some(cfg) = self.config.agents.get(agent) {
                        let (program, _) = agent_command(&cfg.provider);
                        needed_agents.insert(program);
                    }
                }
                WorkflowStep::ReviewSwarm { agents, .. } => {
                    for agent in agents {
                        if let Some(cfg) = self.config.agents.get(agent) {
                            let (program, _) = agent_command(&cfg.provider);
                            needed_agents.insert(program);
                        }
                    }
                }
                WorkflowStep::Pr { create, .. } if *create => {
                    needed_agents.insert("gh");
                }
                _ => {}
            }
        }

        for tool in needed_agents {
            check_tool_exists(tool).await.with_context(|| {
                format!("`{tool}` is not installed or not on PATH — the workflow requires it")
            })?;
        }

        self.emit(
            run,
            None,
            EventKind::StateChange,
            EventLevel::Info,
            "preflight checks passed".into(),
        )
        .await;

        Ok(())
    }

    /// Clean up the worktree directory after a run reaches a terminal state.
    async fn cleanup_worktree(&self, run: &superkick_core::Run) {
        let Some(ref wt_path_str) = run.worktree_path else {
            return;
        };

        let wt_path = PathBuf::from(wt_path_str);
        if !wt_path.exists() {
            return;
        }

        let repo_root = PathBuf::from(&self.config.runner.repo_root);
        let bare_path = self.repo_cache.cache_path(&run.repo_slug);

        match WorktreeManager::new(
            bare_path,
            crate::worktree::default_worktree_root(&repo_root),
            self.config.runner.worktree_prefix.clone(),
        )
        .await
        {
            Ok(mgr) => {
                if let Err(e) = mgr.cleanup(&wt_path).await {
                    warn!(
                        run_id = %run.id,
                        path = %wt_path.display(),
                        error = %e,
                        "failed to clean up worktree (manual removal may be needed)"
                    );
                } else {
                    info!(
                        run_id = %run.id,
                        path = %wt_path.display(),
                        "worktree cleaned up"
                    );
                }
            }
            Err(e) => {
                warn!(
                    run_id = %run.id,
                    error = %e,
                    "failed to create worktree manager for cleanup"
                );
            }
        }
    }

    /// Build the ordered list of step keys from config, prepending Prepare.
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

    /// Dispatch a single step to its handler.
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
            StepKey::Plan => {
                let wt = require_worktree(worktree_path)?;
                let agent_name = self.find_workflow_agent(key)?;
                self.execute_agent(run, step, &agent_name, wt, cancel_token)
                    .await
            }
            StepKey::Code => {
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
                self.execute_create_pr(run, step, wt).await
            }
            StepKey::ReviewSwarm => {
                let wt = require_worktree(worktree_path)?;
                let (agents, threshold) = self.find_review_swarm_config()?;
                self.execute_review_swarm(run, step, &agents, threshold, wt)
                    .await
            }
            StepKey::AwaitHuman => {
                // Out of scope.
                Ok(())
            }
        }
    }

    /// Prepare step: ensure bare clone exists, create worktree.
    async fn execute_prepare(&self, run: &mut superkick_core::Run) -> Result<()> {
        let clone_url = crate::worktree::github_clone_url(&run.repo_slug);
        let bare_path = self
            .repo_cache
            .ensure(&run.repo_slug, &clone_url)
            .await
            .context("failed to ensure bare clone")?;

        let repo_root = PathBuf::from(&self.config.runner.repo_root);
        let wt_root = crate::worktree::default_worktree_root(&repo_root);

        let wt_mgr = WorktreeManager::new(
            bare_path,
            wt_root,
            self.config.runner.worktree_prefix.clone(),
        )
        .await
        .context("failed to create worktree manager")?;

        let WorktreeInfo { path, branch } = wt_mgr
            .create(run.id, &run.issue_identifier, &run.base_branch)
            .await
            .context("failed to create worktree")?;

        run.worktree_path = Some(path.to_string_lossy().into_owned());
        run.branch_name = Some(branch);
        self.run_repo.update(run).await?;

        info!(
            run_id = %run.id,
            worktree = %path.display(),
            "worktree created"
        );

        Ok(())
    }

    /// Execute an agent step (Plan or Code) via the AgentSupervisor.
    async fn execute_agent(
        &self,
        run: &superkick_core::Run,
        step: &RunStep,
        agent_name: &str,
        worktree: &std::path::Path,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
        let agent_cfg = self
            .config
            .agents
            .get(agent_name)
            .with_context(|| format!("agent '{agent_name}' not found in config"))?;

        let (program, base_args) = agent_command(&agent_cfg.provider);

        let mut args = vec![program.to_string()];
        args.extend(base_args.iter().map(|s| s.to_string()));

        // Build a prompt for the agent based on the step type.
        let prompt = match step.step_key {
            StepKey::Plan => format!(
                "You are working on issue {} (id: {}). \
                 Analyze the codebase and create a detailed implementation plan. \
                 Describe the files to change, the approach, and any risks. \
                 Do NOT make code changes yet — only plan. \
                 IMPORTANT: Do NOT update the issue status in Linear or any external tracker. \
                 Do NOT mark the issue as done, closed, or resolved. Only plan the implementation.",
                run.issue_identifier, run.issue_id,
            ),
            StepKey::Code => format!(
                "You are working on issue {} (id: {}). \
                 Implement the changes needed to resolve this issue. \
                 Follow the existing code style and patterns. \
                 Make all necessary code changes. \
                 IMPORTANT: Do NOT update the issue status in Linear or any external tracker. \
                 Do NOT mark the issue as done, closed, or resolved. Only write code.",
                run.issue_identifier, run.issue_id,
            ),
            other => format!(
                "You are working on issue {} (id: {}). Execute step: {:?}. \
                 IMPORTANT: Do NOT update the issue status in Linear or any external tracker. \
                 Do NOT mark the issue as done, closed, or resolved.",
                run.issue_identifier, run.issue_id, other,
            ),
        };
        args.push(prompt);

        let launch_cfg = AgentLaunchConfig {
            run_id: run.id,
            step_id: step.id,
            provider: agent_cfg.provider,
            args,
            workdir: worktree.to_path_buf(),
            timeout: DEFAULT_AGENT_TIMEOUT,
        };

        let (handle, join) = self
            .supervisor
            .launch(launch_cfg)
            .await
            .context("failed to launch agent")?;

        let result = tokio::select! {
            res = join => {
                res.context("agent task panicked")?
                   .context("agent execution failed")?
            }
            _ = cancel_token.cancelled() => {
                handle.cancel().await;
                bail!("run cancelled during agent execution");
            }
        };

        if result.session.exit_code != Some(0) {
            bail!(
                "agent '{}' exited with code {}",
                agent_name,
                result.session.exit_code.unwrap_or(-1)
            );
        }

        Ok(())
    }

    /// Execute the Commands step: run each command as a subprocess in the worktree.
    async fn execute_commands(
        &self,
        run: &superkick_core::Run,
        step: &RunStep,
        commands: &[String],
        worktree: &std::path::Path,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
        for cmd_str in commands {
            if cancel_token.is_cancelled() {
                bail!("run cancelled before command: {cmd_str}");
            }
            info!(run_id = %run.id, command = %cmd_str, "running command");

            self.emit(
                run,
                Some(step.id),
                EventKind::CommandOutput,
                EventLevel::Info,
                format!("$ {cmd_str}"),
            )
            .await;

            let mut child = Command::new("sh")
                .args(["-c", cmd_str])
                .current_dir(worktree)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .with_context(|| format!("failed to spawn command: {cmd_str}"))?;

            // Stream stdout.
            let stdout = child.stdout.take();
            let event_repo = Arc::clone(&self.event_repo);
            let run_id = run.id;
            let step_id = step.id;
            let stdout_task = tokio::spawn(async move {
                if let Some(out) = stdout {
                    let mut lines = BufReader::new(out).lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        emit_event(
                            &*event_repo,
                            run_id,
                            Some(step_id),
                            EventKind::CommandOutput,
                            EventLevel::Info,
                            line,
                        )
                        .await;
                    }
                }
            });

            // Stream stderr.
            let stderr = child.stderr.take();
            let event_repo = Arc::clone(&self.event_repo);
            let stderr_task = tokio::spawn(async move {
                if let Some(err) = stderr {
                    let mut lines = BufReader::new(err).lines();
                    while let Ok(Some(line)) = lines.next_line().await {
                        emit_event(
                            &*event_repo,
                            run_id,
                            Some(step_id),
                            EventKind::CommandOutput,
                            EventLevel::Warn,
                            line,
                        )
                        .await;
                    }
                }
            });

            let status = child
                .wait()
                .await
                .with_context(|| format!("failed to wait on command: {cmd_str}"))?;

            let _ = tokio::join!(stdout_task, stderr_task);

            if !status.success() {
                bail!(
                    "command `{cmd_str}` failed with exit code {}",
                    status.code().unwrap_or(-1)
                );
            }
        }

        Ok(())
    }

    /// Execute the CreatePr step: push branch and open a GitHub PR via `gh`.
    async fn execute_create_pr(
        &self,
        run: &superkick_core::Run,
        step: &RunStep,
        worktree: &std::path::Path,
    ) -> Result<()> {
        let (create, _generate_description) = self.find_pr_config();

        if !create {
            info!(run_id = %run.id, "PR creation disabled (create: false) — skipping");
            return Ok(());
        }

        let branch = run
            .branch_name
            .as_deref()
            .context("branch_name not set on run")?;

        // Ensure the worktree has a remote pointing to GitHub.
        let clone_url = crate::worktree::github_clone_url(&run.repo_slug);
        let remote_check = crate::git::git_raw(worktree, &["remote", "get-url", "origin"]).await;
        if !matches!(remote_check, Ok(output) if output.status.success()) {
            crate::git::git(worktree, &["remote", "add", "origin", &clone_url])
                .await
                .context("failed to add origin remote to worktree")?;
        }

        // Fetch so the worktree knows about origin/main.
        let _ = crate::git::git(worktree, &["fetch", "origin", &run.base_branch]).await;

        // Capture the base SHA before any commit — used to detect divergence.
        let base_sha = crate::git::git(
            worktree,
            &["rev-parse", &format!("origin/{}", run.base_branch)],
        )
        .await
        .unwrap_or_default();

        // Stage and commit any uncommitted changes left by the coding agent.
        let status_out = crate::git::git_raw(worktree, &["status", "--porcelain"])
            .await
            .context("failed to run git status")?;
        let has_changes = status_out.status.success()
            && !String::from_utf8_lossy(&status_out.stdout)
                .trim()
                .is_empty();

        if has_changes {
            self.emit(
                run,
                Some(step.id),
                EventKind::CommandOutput,
                EventLevel::Info,
                "$ git add -A && git commit".to_string(),
            )
            .await;

            crate::git::git(worktree, &["add", "-A"])
                .await
                .context("failed to stage changes")?;

            let commit_msg = format!("feat({}): implement changes", run.issue_identifier);
            crate::git::git(worktree, &["commit", "-m", &commit_msg])
                .await
                .context("failed to commit staged changes")?;
        }

        // Verify HEAD has diverged from the base branch.
        let head_sha = crate::git::git(worktree, &["rev-parse", "HEAD"])
            .await
            .context("failed to get HEAD sha")?;

        if head_sha.trim() == base_sha.trim() {
            bail!(
                "no commits between '{}' and '{}' — the coding agent produced no changes",
                run.base_branch,
                branch
            );
        }

        // Push the branch to remote.
        self.emit(
            run,
            Some(step.id),
            EventKind::CommandOutput,
            EventLevel::Info,
            format!("$ git push origin {branch}"),
        )
        .await;

        crate::git::git(worktree, &["push", "-u", "origin", branch])
            .await
            .with_context(|| format!("failed to push branch '{branch}' to origin"))?;

        // Build gh pr create command.
        let title = format!("{}: automated PR", run.issue_identifier);
        let body = format!(
            "Automated PR for issue {} (`{}`)\n\nGenerated by superkick.",
            run.issue_identifier, run.issue_id,
        );
        let gh_args = vec![
            "pr",
            "create",
            "--head",
            branch,
            "--base",
            &run.base_branch,
            "--title",
            &title,
            "--body",
            &body,
        ];

        self.emit(
            run,
            Some(step.id),
            EventKind::CommandOutput,
            EventLevel::Info,
            format!("$ gh {}", gh_args.join(" ")),
        )
        .await;

        // Run gh pr create and stream output.
        let mut child = Command::new("gh")
            .args(&gh_args)
            .current_dir(worktree)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .context("failed to spawn `gh pr create`")?;

        let stdout = child.stdout.take();
        let event_repo = Arc::clone(&self.event_repo);
        let run_id = run.id;
        let step_id = step.id;
        let stdout_task = tokio::spawn(async move {
            let mut collected = String::new();
            if let Some(out) = stdout {
                let mut lines = BufReader::new(out).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    emit_event(
                        &*event_repo,
                        run_id,
                        Some(step_id),
                        EventKind::CommandOutput,
                        EventLevel::Info,
                        line.clone(),
                    )
                    .await;
                    if !collected.is_empty() {
                        collected.push('\n');
                    }
                    collected.push_str(&line);
                }
            }
            collected
        });

        let stderr = child.stderr.take();
        let event_repo = Arc::clone(&self.event_repo);
        let stderr_task = tokio::spawn(async move {
            if let Some(err) = stderr {
                let mut lines = BufReader::new(err).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    emit_event(
                        &*event_repo,
                        run_id,
                        Some(step_id),
                        EventKind::CommandOutput,
                        EventLevel::Warn,
                        line,
                    )
                    .await;
                }
            }
        });

        let status = child
            .wait()
            .await
            .context("failed to wait on `gh pr create`")?;

        let stdout_output = stdout_task.await.unwrap_or_default();
        let _ = stderr_task.await;

        if !status.success() {
            bail!(
                "`gh pr create` failed with exit code {}",
                status.code().unwrap_or(-1)
            );
        }

        // gh pr create prints the PR URL on stdout.
        let pr_url = stdout_output.trim().to_string();
        if pr_url.is_empty() {
            bail!("`gh pr create` succeeded but produced no URL on stdout");
        }

        info!(run_id = %run.id, pr_url = %pr_url, "PR created");

        // Persist as artifact.
        let artifact = Artifact::new(run.id, ArtifactKind::PrUrl, pr_url);
        self.artifact_repo
            .insert(&artifact)
            .await
            .context("failed to persist PR URL artifact")?;

        Ok(())
    }

    /// Extract PR config from the workflow steps, defaulting to create: true.
    fn find_pr_config(&self) -> (bool, bool) {
        for ws in &self.config.workflow.steps {
            if let WorkflowStep::Pr {
                create,
                generate_description,
            } = ws
            {
                return (*create, *generate_description);
            }
        }
        (true, false)
    }

    /// Find the agent name for a Plan or Code step from the workflow config.
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

    /// Find the review swarm config from the workflow steps.
    fn find_review_swarm_config(&self) -> Result<(Vec<String>, u32)> {
        for ws in &self.config.workflow.steps {
            if let WorkflowStep::ReviewSwarm {
                agents,
                findings_threshold,
            } = ws
            {
                return Ok((agents.clone(), *findings_threshold));
            }
        }
        bail!("no ReviewSwarm step found in workflow config")
    }

    /// Execute the ReviewSwarm step: launch N review agents in parallel, aggregate findings.
    async fn execute_review_swarm(
        &self,
        run: &superkick_core::Run,
        step: &RunStep,
        agent_names: &[String],
        findings_threshold: u32,
        worktree: &std::path::Path,
    ) -> Result<()> {
        use superkick_core::{ReviewFinding, ReviewSwarmResult};

        let max_parallel = self.config.budget.max_parallel_agents as usize;

        self.emit(
            run,
            Some(step.id),
            EventKind::AgentOutput,
            EventLevel::Info,
            format!(
                "review swarm: launching {} agent(s) (max parallel: {})",
                agent_names.len(),
                max_parallel
            ),
        )
        .await;

        // Launch all agents, respecting max_parallel_agents via semaphore.
        let semaphore = Arc::new(tokio::sync::Semaphore::new(max_parallel));
        let mut handles: Vec<(
            String,
            tokio::task::JoinHandle<Result<crate::agent_supervisor::AgentResult>>,
        )> = Vec::new();

        for agent_name in agent_names {
            let agent_cfg = self
                .config
                .agents
                .get(agent_name)
                .with_context(|| format!("review agent '{agent_name}' not found in config"))?;

            let (program, base_args) = agent_command(&agent_cfg.provider);
            let mut args = vec![program.to_string()];
            args.extend(base_args.iter().map(|s| s.to_string()));

            let review_prompt = format!(
                "You are a code reviewer for issue {} (id: {}). \
                 Review the changes on this branch. Look for bugs, logic errors, \
                 security issues, and code quality problems. \
                 If the code looks good, say 'LGTM'. \
                 If there are issues, list them clearly. \
                 IMPORTANT: Do NOT update the issue status in Linear or any external tracker. \
                 Do NOT mark the issue as done, closed, or resolved. Only review code.",
                run.issue_identifier, run.issue_id,
            );
            args.push(review_prompt);

            let launch_cfg = AgentLaunchConfig {
                run_id: run.id,
                step_id: step.id,
                provider: agent_cfg.provider,
                args,
                workdir: worktree.to_path_buf(),
                timeout: DEFAULT_AGENT_TIMEOUT,
            };

            let (_handle, join) = self
                .supervisor
                .launch(launch_cfg)
                .await
                .with_context(|| format!("failed to launch review agent '{agent_name}'"))?;

            // Wrap the join handle with semaphore-gated waiting.
            let sem = Arc::clone(&semaphore);
            let name = agent_name.clone();
            let gated = tokio::spawn(async move {
                let _permit = sem
                    .acquire()
                    .await
                    .context("review swarm semaphore closed")?;
                join.await.context("review agent task panicked")?
            });

            handles.push((name, gated));
        }

        // Collect results from all agents.
        let mut findings = Vec::with_capacity(handles.len());
        for (agent_name, handle) in handles {
            let result = handle
                .await
                .with_context(|| format!("review agent '{agent_name}' join failed"))?;

            match result {
                Ok(agent_result) => {
                    let passed = agent_result.session.exit_code == Some(0);
                    findings.push(ReviewFinding {
                        agent_name: agent_name.clone(),
                        session_id: agent_result.session.id,
                        passed,
                        exit_code: agent_result.session.exit_code,
                    });

                    self.emit(
                        run,
                        Some(step.id),
                        EventKind::AgentOutput,
                        EventLevel::Info,
                        format!(
                            "review agent '{}' finished (exit {}): {}",
                            agent_name,
                            agent_result.session.exit_code.unwrap_or(-1),
                            if passed {
                                "passed"
                            } else {
                                "findings detected"
                            }
                        ),
                    )
                    .await;
                }
                Err(e) => {
                    findings.push(ReviewFinding {
                        agent_name: agent_name.clone(),
                        session_id: superkick_core::AgentSessionId::new(),
                        passed: false,
                        exit_code: None,
                    });

                    self.emit(
                        run,
                        Some(step.id),
                        EventKind::AgentOutput,
                        EventLevel::Error,
                        format!("review agent '{agent_name}' failed: {e:#}"),
                    )
                    .await;
                }
            }
        }

        let total_agents = findings.len();
        let passed_count = findings.iter().filter(|f| f.passed).count();
        let failed_count = total_agents - passed_count;
        let gate_passed = (failed_count as u32) < findings_threshold;

        let swarm_result = ReviewSwarmResult {
            findings,
            total_agents,
            passed_count,
            failed_count,
            gate_passed,
        };

        // Persist aggregated result as step output_json.
        let payload = serde_json::to_value(&swarm_result).ok();
        {
            let mut updated_step = step.clone();
            updated_step.output_json = payload.clone();
            let _ = self.step_repo.update(&updated_step).await;
        }

        // Emit aggregated review event.
        let summary_msg = format!(
            "review swarm complete: {passed_count}/{total_agents} passed, {failed_count} failed — gate {}",
            if gate_passed { "PASSED" } else { "FAILED" }
        );

        let mut event = RunEvent::new(
            run.id,
            Some(step.id),
            EventKind::ReviewCompleted,
            if gate_passed {
                EventLevel::Info
            } else {
                EventLevel::Warn
            },
            summary_msg.clone(),
        );
        event.payload_json = payload.clone();
        if let Err(e) = self.event_repo.insert(&event).await {
            warn!("failed to emit review completed event: {e}");
        }

        if !gate_passed {
            bail!(
                "review gate failed: {failed_count} agent(s) reported findings (threshold: {findings_threshold})"
            );
        }

        Ok(())
    }

    /// Find the command list for a Commands step from the workflow config.
    fn find_workflow_commands(&self) -> Result<Vec<String>> {
        for ws in &self.config.workflow.steps {
            if let WorkflowStep::Commands { run } = ws {
                return Ok(run.clone());
            }
        }
        bail!("no Commands step found in workflow config")
    }

    /// Transition the run to Failed, persist, and emit.
    /// Poll the interrupt repo until the given interrupt is resolved, then
    /// return the chosen action.
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

        // Failed is always reachable from non-terminal states.
        let _ = run.transition_to(RunState::Failed);
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

    /// Emit a run event, logging on failure.
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

// ── free functions ─────────────────────────────────────────────────────

/// Map a StepKey to the corresponding RunState.
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

/// Build the CLI command for an agent provider.
fn agent_command(provider: &AgentProvider) -> (&'static str, Vec<&'static str>) {
    match provider {
        AgentProvider::Claude => ("claude", vec!["--print", "--dangerously-skip-permissions"]),
        AgentProvider::Codex => ("codex", vec![]),
    }
}

/// Require a worktree path, failing if Prepare hasn't run.
fn require_worktree(path: Option<&std::path::Path>) -> Result<&std::path::Path> {
    path.context("worktree path not set — Prepare step must run first")
}

/// Check that a CLI tool exists on PATH by running `<tool> --version`.
async fn check_tool_exists(tool: &str) -> Result<()> {
    let output = Command::new(tool)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .with_context(|| format!("`{tool}` not found on PATH"))?;
    if !output.success() {
        bail!(
            "`{tool} --version` exited with {}",
            output.code().unwrap_or(-1)
        );
    }
    Ok(())
}

/// Emit a run event, logging on failure rather than propagating.
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
