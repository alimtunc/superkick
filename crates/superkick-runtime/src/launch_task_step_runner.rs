//! SUP-124 — production `StepRunner` for `LaunchTaskExecutor`.
//!
//! Replaces the V1 `StubStepRunner` with a real agent spawn for each
//! Plan/Implement/Review step. Each `LaunchTask` is anchored on a synthetic
//! `Run` ("shadow run") with `TriggerSource::LaunchTask` so the FK pair
//! `(run_id, run_step_id)` `agent_sessions` requires is available without
//! refactoring the schema. The shadow run also owns the worktree shared
//! across the three steps.
//!
//! The runner is provider-agnostic — it goes through `RoleRouter` +
//! `AgentSupervisor::launch` just like `StepEngine::execute_agent`. The MCP
//! policy + Linear snapshot wiring is reused via the `crate::agent_spawn`
//! module so the two callers can't drift.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::Utc;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;
use tracing::{error, info, warn};

use superkick_config::SuperkickConfig;
use superkick_core::{
    AgentCatalog, EventKind, EventLevel, LaunchReason, LaunchStepKind, LaunchTask, LaunchTaskId,
    LaunchTaskStep, LaunchTaskStepId, RoleRouter, Run, RunId, RunPolicy, RunState, RunStep, StepId,
    StepKey, StepResult, StepResultStatus, StepStatus, TriggerSource,
};
use superkick_storage::repo::{
    AgentSessionRepo, LaunchTaskRepo, RunEventRepo, RunRepo, RunStepRepo, TranscriptRepo,
};

use crate::agent_spawn::{LaunchConfigInputs, build_launch_config, resolve_spawn_plan};
use crate::agent_supervisor::AgentSupervisor;
use crate::launch_task_event_bus::{LaunchTaskEvent, LaunchTaskEventBus};
use crate::launch_task_executor::{StepLinks, StepOutcome, StepRunner};
use crate::linear_context::OptionalLinearClient;
use crate::repo_cache::RepoCache;
use crate::session_bus::SessionBus;
use crate::step_engine::build_full_prompt;
use crate::step_engine::prompts::{PromptStepKind, step_body_for};
use crate::worktree::{WorktreeInfo, WorktreeManager, default_worktree_root};

/// Default agent timeout when the resolved role does not pin one. Same
/// constant the playbook engine uses (`step_engine::DEFAULT_AGENT_TIMEOUT`)
/// to keep the two paths interchangeable.
const DEFAULT_AGENT_TIMEOUT: Duration = Duration::from_secs(600);

/// Cap on the persisted `LaunchTaskStep::summary`. The UI renders the column
/// inline so longer payloads are mostly noise; the full transcript lives in
/// the agent session anyway.
const SUMMARY_MAX_CHARS: usize = 512;

/// Map a Launch Task kind to its playbook-engine-equivalent prompt body.
fn prompt_kind_for(kind: LaunchStepKind) -> PromptStepKind {
    match kind {
        LaunchStepKind::Plan => PromptStepKind::Plan,
        LaunchStepKind::Implement => PromptStepKind::Implement,
        LaunchStepKind::Review => PromptStepKind::Review,
    }
}

/// Truncate to the last `max_chars` characters. Used to keep the persisted
/// step summary inside `SUMMARY_MAX_CHARS` while preserving the most
/// decision-bearing tail of the agent's output. O(n) once over the input.
fn truncate_tail_chars(s: &str, max_chars: usize) -> String {
    let total = s.chars().count();
    if total <= max_chars {
        return s.to_string();
    }
    s.chars().skip(total - max_chars).collect()
}

/// Cached substrate per LaunchTask — created lazily on the first step so
/// retries and re-runs reuse the same worktree + shadow `Run`.
struct ShadowTaskState {
    run_id: RunId,
    worktree: PathBuf,
}

/// Construction dependencies for `RealStepRunner`. Mirrors the
/// `StepEngineDeps` pattern so the wiring stays one struct literal per call
/// site.
pub struct RealStepRunnerDeps<R, ST, E, A, T, L>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    T: TranscriptRepo + 'static,
    L: LaunchTaskRepo + 'static,
{
    pub run_repo: Arc<R>,
    pub step_repo: Arc<ST>,
    pub event_repo: Arc<E>,
    pub session_repo: Arc<A>,
    pub transcript_repo: Arc<T>,
    pub launch_task_repo: Arc<L>,
    pub registry: Arc<crate::pty_session::PtySessionRegistry>,
    pub session_bus: Option<Arc<SessionBus>>,
    pub launch_task_bus: Arc<LaunchTaskEventBus>,
    pub repo_cache: RepoCache,
    pub config: SuperkickConfig,
    pub linear_client: OptionalLinearClient,
    pub repo_slug: String,
    pub base_branch: String,
}

/// Production `StepRunner` that spawns a real agent for every Launch Task
/// step.
pub struct RealStepRunner<R, ST, E, A, T, L>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    T: TranscriptRepo + 'static,
    L: LaunchTaskRepo + 'static,
{
    run_repo: Arc<R>,
    step_repo: Arc<ST>,
    event_repo: Arc<E>,
    launch_task_repo: Arc<L>,
    launch_task_bus: Arc<LaunchTaskEventBus>,
    supervisor: AgentSupervisor<A, E, T>,
    repo_cache: RepoCache,
    catalog: AgentCatalog,
    policy: RunPolicy,
    mcp_registry: HashMap<String, superkick_config::McpServerSpec>,
    linear_client: OptionalLinearClient,
    config: SuperkickConfig,
    repo_slug: String,
    base_branch: String,
    /// In-memory cache of the shadow Run+worktree per Launch Task. Guarded
    /// by a `Mutex` rather than a `DashMap` — entries are accessed once per
    /// step (3 times per task) and contention is per-task, not per-step.
    shadow_runs: Mutex<HashMap<LaunchTaskId, ShadowTaskState>>,
}

impl<R, ST, E, A, T, L> RealStepRunner<R, ST, E, A, T, L>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    T: TranscriptRepo + 'static,
    L: LaunchTaskRepo + 'static,
{
    pub fn new(deps: RealStepRunnerDeps<R, ST, E, A, T, L>) -> Self {
        let mut supervisor = AgentSupervisor::new(
            deps.session_repo,
            Arc::clone(&deps.event_repo),
            deps.transcript_repo,
            deps.registry,
        );
        if let Some(bus) = deps.session_bus {
            supervisor = supervisor.with_lifecycle_bus(bus);
        }
        let catalog = deps.config.agent_catalog();
        let policy = deps.config.base_run_policy();
        let mcp_registry = deps.config.effective_mcp_servers();
        Self {
            run_repo: deps.run_repo,
            step_repo: deps.step_repo,
            event_repo: deps.event_repo,
            launch_task_repo: deps.launch_task_repo,
            launch_task_bus: deps.launch_task_bus,
            supervisor,
            repo_cache: deps.repo_cache,
            catalog,
            policy,
            mcp_registry,
            linear_client: deps.linear_client,
            config: deps.config,
            repo_slug: deps.repo_slug,
            base_branch: deps.base_branch,
            shadow_runs: Mutex::new(HashMap::new()),
        }
    }

    fn publish_shadow_run_state(&self, task: &LaunchTask, run_id: RunId, state: RunState) {
        self.launch_task_bus
            .publish(LaunchTaskEvent::ShadowRunStateChanged {
                task_id: task.id,
                linear_issue_id: task.linear_issue_id.clone(),
                run_id,
                state,
            });
    }

    /// Materialise (or reuse) the shadow `Run` + worktree backing a Launch
    /// Task. Idempotent: subsequent steps for the same task reuse the
    /// in-memory cache without touching the DB.
    async fn ensure_shadow_run(&self, task: &LaunchTask) -> Result<(RunId, PathBuf)> {
        {
            let map = self.shadow_runs.lock().await;
            if let Some(state) = map.get(&task.id) {
                return Ok((state.run_id, state.worktree.clone()));
            }
        }

        let clone_url = crate::worktree::github_clone_url(&self.repo_slug);
        let bare_path = self
            .repo_cache
            .ensure(&self.repo_slug, &clone_url)
            .await
            .context("failed to ensure bare clone for launch task worktree")?;

        let repo_root = PathBuf::from(&self.config.runner.repo_root);
        let wt_root = default_worktree_root(&repo_root);
        let wt_mgr = WorktreeManager::new(
            bare_path,
            wt_root,
            self.config.runner.worktree_prefix.clone(),
        )
        .await
        .context("failed to construct WorktreeManager for launch task")?;

        let mut run = Run::new(
            task.linear_issue_id.clone(),
            task.linear_issue_id.clone(),
            self.repo_slug.clone(),
            TriggerSource::LaunchTask,
            superkick_core::ExecutionMode::FullAuto,
            self.base_branch.clone(),
            true,
            None,
        );
        run.transition_to(RunState::Preparing)
            .context("Queued → Preparing on shadow run must be valid")?;

        let WorktreeInfo { path, branch } = wt_mgr
            .create(run.id, &task.linear_issue_id, &self.base_branch)
            .await
            .with_context(|| format!("failed to create worktree for launch task {}", task.id))?;

        run.worktree_path = Some(path.to_string_lossy().into_owned());
        run.branch_name = Some(branch);
        if let Err(err) = self.run_repo.insert(&run).await {
            // The worktree was created on disk but the row never persisted, so
            // any retry would mint a new path and leave this one orphaned. Best
            // effort: drop the dangling worktree before surfacing the error.
            if let Err(cleanup_err) = wt_mgr.cleanup(&path).await {
                warn!(
                    launch_task_id = %task.id,
                    worktree = %path.display(),
                    error = %cleanup_err,
                    "failed to clean up orphaned worktree after shadow run insert error",
                );
            }
            return Err(err).with_context(|| {
                format!("failed to insert shadow run for launch task {}", task.id)
            });
        }

        info!(
            launch_task_id = %task.id,
            shadow_run_id = %run.id,
            worktree = %path.display(),
            "shadow run created for launch task"
        );

        self.publish_shadow_run_state(task, run.id, run.state);

        let mut map = self.shadow_runs.lock().await;
        // A concurrent task call may have raced us — last writer wins, the
        // earlier worktree is leaked. In practice the executor calls the
        // runner sequentially per task so this branch is unreachable; the
        // defensive check keeps the invariant explicit.
        let entry = map.entry(task.id).or_insert(ShadowTaskState {
            run_id: run.id,
            worktree: path.clone(),
        });
        Ok((entry.run_id, entry.worktree.clone()))
    }

    /// Direct field write on the shadow `Run`'s state machine. Bypasses
    /// `Run::transition_to` because the playbook FSM forbids edges Launch
    /// Tasks need (e.g. `Coding → Reviewing` skipping the `RunningCommands`
    /// stage, or `Reviewing → Completed` skipping `OpeningPr`). The shadow
    /// run is a synthetic mirror — its job is to keep the runs dashboard
    /// honest, not to obey the playbook engine's invariants.
    async fn set_shadow_run_state(
        &self,
        task: &LaunchTask,
        run: &mut Run,
        new_state: RunState,
    ) -> Result<()> {
        run.state = new_state;
        let now = Utc::now();
        run.updated_at = now;
        if new_state.is_terminal() {
            run.finished_at = Some(now);
        }
        self.run_repo
            .update(run)
            .await
            .with_context(|| format!("shadow run {} state → {new_state}", run.id))?;
        self.publish_shadow_run_state(task, run.id, new_state);
        Ok(())
    }

    /// Mark the shadow `RunStep` terminal so the runs dashboard stops
    /// reporting "In progress" once the agent has exited. `error` is
    /// populated for `Failed` / cancellation paths so the run log carries
    /// the reason next to the `RunStep` row.
    async fn finish_run_step(&self, step_id: StepId, status: StepStatus, error: Option<String>) {
        match self.step_repo.get(step_id).await {
            Ok(Some(mut step)) => {
                step.status = status;
                step.finished_at = Some(Utc::now());
                step.error_message = error;
                if let Err(e) = self.step_repo.update(&step).await {
                    warn!(%step_id, error = %e, "failed to update shadow run_step status");
                }
            }
            Ok(None) => warn!(%step_id, "shadow run_step missing on finalisation"),
            Err(e) => warn!(%step_id, error = %e, "failed to fetch shadow run_step"),
        }
    }

    /// Map a Launch Task step kind to the run state the shadow `Run`
    /// should report while that step is in flight. Picks the closest
    /// playbook equivalent so the dashboard banner remains intelligible.
    fn shadow_run_state_for_step(kind: LaunchStepKind) -> RunState {
        match kind {
            LaunchStepKind::Plan => RunState::Planning,
            LaunchStepKind::Implement => RunState::Coding,
            LaunchStepKind::Review => RunState::Reviewing,
        }
    }

    /// Create the per-LaunchTaskStep `RunStep` backing the spawn. Maps the
    /// kind to the closest `StepKey` so the run_steps timeline stays
    /// readable on the dashboard.
    async fn ensure_run_step(&self, run_id: RunId, step_kind: LaunchStepKind) -> Result<StepId> {
        let step_key = match step_kind {
            LaunchStepKind::Plan => StepKey::Plan,
            LaunchStepKind::Implement => StepKey::Code,
            LaunchStepKind::Review => StepKey::ReviewSwarm,
        };
        let mut step = RunStep::new(run_id, step_key, 1);
        step.status = StepStatus::Running;
        step.started_at = Some(Utc::now());
        self.step_repo
            .insert(&step)
            .await
            .with_context(|| format!("failed to insert shadow run_step for run {run_id}"))?;
        Ok(step.id)
    }

    /// Previous step's summary: prefers `structured_result.summary`, falls back to the legacy `summary` column.
    async fn previous_step_summary(
        &self,
        task_id: LaunchTaskId,
        current_sequence: u32,
    ) -> Result<Option<String>> {
        if current_sequence <= 1 {
            return Ok(None);
        }
        // `LaunchTaskRepo::list_steps` is contract-bound to return rows in
        // ascending `sequence` order, so no client-side sort is needed.
        let steps = self.launch_task_repo.list_steps(task_id).await?;
        let prev = steps
            .into_iter()
            .find(|s| s.sequence + 1 == current_sequence);
        Ok(prev.and_then(|s| s.structured_result.map(|sr| sr.summary).or(s.summary)))
    }

    /// Build the base prompt for one step. The body wording lives in
    /// `step_engine::prompts` so the playbook engine and the Launch Task
    /// runner cannot drift on the guard rails.
    fn build_base_prompt(
        task: &LaunchTask,
        step_kind: LaunchStepKind,
        previous_summary: Option<&str>,
    ) -> String {
        let preamble = format!(
            "You are working on Linear issue {issue} as part of an automated \
             Plan → Implement → Review run.",
            issue = task.linear_issue_id,
        );
        let body = step_body_for(prompt_kind_for(step_kind));
        let mut prompt = format!("{preamble}\n\n{body}");
        if let Some(summary) = previous_summary.filter(|s| !s.is_empty()) {
            prompt.push_str("\n\n--- Previous step summary ---\n");
            prompt.push_str(summary);
        }
        prompt
    }

    /// Persist the structured result; on failure, log and emit a `Warn` run event so operators see the drift in the timeline.
    async fn persist_structured_result(
        &self,
        run_id: RunId,
        run_step_id: StepId,
        launch_step_id: LaunchTaskStepId,
        result: StepResult,
    ) {
        let Err(e) = self
            .launch_task_repo
            .set_step_structured_result(launch_step_id, Some(result))
            .await
        else {
            return;
        };
        warn!(
            launch_task_step_id = %launch_step_id,
            error = %e,
            "failed to persist structured_result — step status will still flip"
        );
        crate::agent_supervisor::output::emit_event(
            &*self.event_repo,
            run_id,
            run_step_id,
            EventKind::Error,
            EventLevel::Warn,
            format!("structured_result persist failed: {e}"),
        )
        .await;
    }

    async fn fail_step(&self, run_step_id: StepId, reason: String) -> StepOutcome {
        self.finish_run_step(run_step_id, StepStatus::Failed, Some(reason.clone()))
            .await;
        StepOutcome::Failed { reason }
    }

    async fn process_completion(
        &self,
        task: &LaunchTask,
        step: &LaunchTaskStep,
        run: &mut Run,
        run_step_id: StepId,
        result: crate::agent_supervisor::AgentResult,
        role: &str,
    ) -> Result<StepOutcome> {
        let shadow_run_id = run.id;
        let exit_code = result.session.exit_code.unwrap_or(-1);
        if exit_code != 0 {
            return Ok(self
                .fail_step(run_step_id, format!("{role} exited with code {exit_code}"))
                .await);
        }
        let step_result = match result.step_result {
            Ok(opt) => opt,
            Err(err) => {
                return Ok(self
                    .fail_step(run_step_id, format!("step result marker malformed: {err}"))
                    .await);
            }
        };
        let Some(step_result) = step_result else {
            return Ok(self
                .fail_step(
                    run_step_id,
                    format!("{role} exited 0 but never emitted SUPERKICK_STEP_RESULT_BEGIN..END"),
                )
                .await);
        };

        // Persist before the status flip so a mid-flight crash still leaves a record.
        self.persist_structured_result(shadow_run_id, run_step_id, step.id, step_result.clone())
            .await;

        // TODO(SUP-136b): split needs_human vs failed branches; for now both fold into Failed.
        if !matches!(step_result.status, StepResultStatus::Completed) {
            return Ok(self
                .fail_step(
                    run_step_id,
                    format!(
                        "{role} reported status={:?}: {}",
                        step_result.status, step_result.summary
                    ),
                )
                .await);
        }

        self.finish_run_step(run_step_id, StepStatus::Succeeded, None)
            .await;
        if matches!(step.step_kind, LaunchStepKind::Review)
            && let Err(e) = self
                .set_shadow_run_state(task, run, RunState::Completed)
                .await
        {
            warn!(
                shadow_run_id = %shadow_run_id,
                error = %e,
                "failed to mark shadow run completed — dashboard may stay on Reviewing"
            );
        }

        let summary = truncate_tail_chars(&step_result.summary, SUMMARY_MAX_CHARS);
        Ok(StepOutcome::Completed {
            summary: Some(summary),
            links: StepLinks {
                run_id: Some(shadow_run_id),
                conversation_id: None,
                orchestrator_session_id: None,
            },
        })
    }
}

impl<R, ST, E, A, T, L> StepRunner for RealStepRunner<R, ST, E, A, T, L>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    T: TranscriptRepo + 'static,
    L: LaunchTaskRepo + 'static,
{
    async fn run_step(
        &self,
        task: &LaunchTask,
        step: &LaunchTaskStep,
        cancel: CancellationToken,
    ) -> Result<StepOutcome> {
        let (shadow_run_id, worktree) = match self.ensure_shadow_run(task).await {
            Ok(pair) => pair,
            Err(e) => {
                return Ok(StepOutcome::Failed {
                    reason: format!("shadow run setup failed: {e:#}"),
                });
            }
        };

        if let Err(e) = self
            .launch_task_repo
            .add_step_links(step.id, Some(shadow_run_id), None, None)
            .await
        {
            // The step still runs, but cancel-from-run silently degrades:
            // `cancel_run` looks the launch task up via `linked_run_id`, so
            // without the link the API falls back to cancelling only the
            // shadow `Run` and the launch step keeps executing.
            error!(
                launch_task_id = %task.id,
                step_id = %step.id,
                shadow_run_id = %shadow_run_id,
                error = %e,
                "failed to link step to shadow run — cancel-from-run will not propagate for this step"
            );
        }

        let mut run = match self.run_repo.get(shadow_run_id).await? {
            Some(run) => run,
            None => {
                return Ok(StepOutcome::Failed {
                    reason: format!("shadow run {shadow_run_id} disappeared"),
                });
            }
        };

        // Move the shadow Run's state banner forward so the dashboard
        // reflects which Launch Task step is currently in flight.
        let phase_state = Self::shadow_run_state_for_step(step.step_kind);
        if let Err(e) = self.set_shadow_run_state(task, &mut run, phase_state).await {
            warn!(
                shadow_run_id = %shadow_run_id,
                error = %e,
                "failed to advance shadow run state — continuing"
            );
        }

        let run_step_id = match self.ensure_run_step(shadow_run_id, step.step_kind).await {
            Ok(id) => id,
            Err(e) => {
                return Ok(StepOutcome::Failed {
                    reason: format!("run_step insert failed: {e:#}"),
                });
            }
        };

        let router = RoleRouter::new(&self.catalog, &self.policy);
        let resolved = match router.resolve(&step.agent_name) {
            Ok(r) => r,
            Err(e) => {
                return Ok(StepOutcome::Failed {
                    reason: format!("agent role '{}' resolution failed: {e}", step.agent_name),
                });
            }
        };

        let spawn_plan = match resolve_spawn_plan(
            &run,
            &resolved,
            &worktree,
            run_step_id,
            &*self.event_repo,
            &self.mcp_registry,
            &self.linear_client,
        )
        .await
        {
            Ok(plan) => plan,
            Err(e) => {
                return Ok(StepOutcome::Failed {
                    reason: format!("MCP/Linear policy resolution failed: {e:#}"),
                });
            }
        };

        let previous_summary = self
            .previous_step_summary(task.id, step.sequence)
            .await
            .unwrap_or_else(|e| {
                warn!(
                    launch_task_id = %task.id,
                    error = %e,
                    "failed to read previous step summary — continuing without it"
                );
                None
            });

        let base_prompt =
            Self::build_base_prompt(task, step.step_kind, previous_summary.as_deref());
        let default_instructions = &self.config.launch_profile.default_instructions;
        let prompt = build_full_prompt(
            &base_prompt,
            Some(default_instructions.as_str()).filter(|s| !s.is_empty()),
            None,
            None,
            resolved.system_prompt.as_deref(),
            spawn_plan.snapshot_block.as_deref(),
        );

        let launch_cfg = build_launch_config(
            &spawn_plan,
            LaunchConfigInputs {
                run_id: shadow_run_id,
                step_id: run_step_id,
                resolved: &resolved,
                prompt,
                workdir: worktree.clone(),
                default_timeout: DEFAULT_AGENT_TIMEOUT,
                purpose: format!(
                    "{} agent for launch task {}",
                    step.step_kind, task.linear_issue_id
                ),
                launch_reason: LaunchReason::InitialStep,
            },
        );

        let (handle, join) = match self.supervisor.launch(launch_cfg).await {
            Ok(pair) => pair,
            Err(e) => {
                return Ok(StepOutcome::Failed {
                    reason: format!("agent spawn failed: {e:#}"),
                });
            }
        };

        let session_outcome = tokio::select! {
            res = join => match res {
                Ok(Ok(result)) => Ok(result),
                Ok(Err(e)) => Err(format!("agent execution failed: {e:#}")),
                Err(e) => Err(format!("agent task panicked: {e}")),
            },
            _ = cancel.cancelled() => {
                handle.cancel();
                self.finish_run_step(run_step_id, StepStatus::Failed, Some("cancelled".into()))
                    .await;
                if let Err(e) = self
                    .set_shadow_run_state(task, &mut run, RunState::Cancelled)
                    .await
                {
                    warn!(
                        shadow_run_id = %shadow_run_id,
                        error = %e,
                        "failed to mark shadow run cancelled — dashboard may stay on step state"
                    );
                }
                return Ok(StepOutcome::Cancelled);
            }
        };

        match session_outcome {
            // Shadow Run state stays at the current step's phase — the
            // LaunchTaskExecutor parks the Launch Task in NeedsHuman so an
            // operator retry can re-enter this same step. Terminal Run.state
            // is only reached on cancel or successful Review.
            Err(reason) => Ok(self.fail_step(run_step_id, reason).await),
            Ok(result) => {
                self.process_completion(task, step, &mut run, run_step_id, result, &resolved.role)
                    .await
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use chrono::Utc;
    use superkick_core::{LaunchRecipe, LaunchTaskStatus};

    fn task(linear_issue_id: &str) -> LaunchTask {
        let now = Utc::now();
        LaunchTask {
            id: LaunchTaskId::new(),
            linear_issue_id: linear_issue_id.into(),
            recipe_kind: LaunchRecipe::PlanImplementReview,
            status: LaunchTaskStatus::Pending,
            current_step_id: None,
            summary: None,
            created_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn shadow_run_state_for_step_maps_every_kind() {
        assert_eq!(
            RealStepRunner::<
                superkick_storage::SqliteRunRepo,
                superkick_storage::SqliteRunStepRepo,
                superkick_storage::SqliteRunEventRepo,
                superkick_storage::SqliteAgentSessionRepo,
                superkick_storage::SqliteTranscriptRepo,
                superkick_storage::SqliteLaunchTaskRepo,
            >::shadow_run_state_for_step(LaunchStepKind::Plan),
            RunState::Planning
        );
        assert_eq!(
            RealStepRunner::<
                superkick_storage::SqliteRunRepo,
                superkick_storage::SqliteRunStepRepo,
                superkick_storage::SqliteRunEventRepo,
                superkick_storage::SqliteAgentSessionRepo,
                superkick_storage::SqliteTranscriptRepo,
                superkick_storage::SqliteLaunchTaskRepo,
            >::shadow_run_state_for_step(LaunchStepKind::Implement),
            RunState::Coding
        );
        assert_eq!(
            RealStepRunner::<
                superkick_storage::SqliteRunRepo,
                superkick_storage::SqliteRunStepRepo,
                superkick_storage::SqliteRunEventRepo,
                superkick_storage::SqliteAgentSessionRepo,
                superkick_storage::SqliteTranscriptRepo,
                superkick_storage::SqliteLaunchTaskRepo,
            >::shadow_run_state_for_step(LaunchStepKind::Review),
            RunState::Reviewing
        );
    }

    #[test]
    fn prompt_kind_for_maps_every_launch_kind() {
        assert_eq!(prompt_kind_for(LaunchStepKind::Plan), PromptStepKind::Plan);
        assert_eq!(
            prompt_kind_for(LaunchStepKind::Implement),
            PromptStepKind::Implement
        );
        assert_eq!(
            prompt_kind_for(LaunchStepKind::Review),
            PromptStepKind::Review
        );
    }

    fn assert_prompt_contains_guardrail(p: &str) {
        assert!(
            p.contains("Do NOT update the issue status"),
            "missing guardrail in prompt:\n{p}"
        );
    }

    #[test]
    fn build_base_prompt_includes_preamble_body_and_guardrail() {
        let t = task("SUP-999");
        for kind in [
            LaunchStepKind::Plan,
            LaunchStepKind::Implement,
            LaunchStepKind::Review,
        ] {
            let p = RealStepRunner::<
                superkick_storage::SqliteRunRepo,
                superkick_storage::SqliteRunStepRepo,
                superkick_storage::SqliteRunEventRepo,
                superkick_storage::SqliteAgentSessionRepo,
                superkick_storage::SqliteTranscriptRepo,
                superkick_storage::SqliteLaunchTaskRepo,
            >::build_base_prompt(&t, kind, None);
            assert!(p.contains("SUP-999"), "{kind:?} missing issue id");
            assert!(
                p.contains("Plan → Implement → Review"),
                "{kind:?} missing recipe label"
            );
            assert_prompt_contains_guardrail(&p);
        }
    }

    #[test]
    fn build_base_prompt_appends_previous_summary_when_present() {
        let t = task("SUP-1");
        let p = RealStepRunner::<
            superkick_storage::SqliteRunRepo,
            superkick_storage::SqliteRunStepRepo,
            superkick_storage::SqliteRunEventRepo,
            superkick_storage::SqliteAgentSessionRepo,
            superkick_storage::SqliteTranscriptRepo,
            superkick_storage::SqliteLaunchTaskRepo,
        >::build_base_prompt(&t, LaunchStepKind::Implement, Some("PLAN_OUTPUT"));
        assert!(p.contains("--- Previous step summary ---"));
        assert!(p.contains("PLAN_OUTPUT"));
    }

    #[test]
    fn build_base_prompt_skips_empty_previous_summary() {
        let t = task("SUP-1");
        let p = RealStepRunner::<
            superkick_storage::SqliteRunRepo,
            superkick_storage::SqliteRunStepRepo,
            superkick_storage::SqliteRunEventRepo,
            superkick_storage::SqliteAgentSessionRepo,
            superkick_storage::SqliteTranscriptRepo,
            superkick_storage::SqliteLaunchTaskRepo,
        >::build_base_prompt(&t, LaunchStepKind::Implement, Some(""));
        assert!(!p.contains("--- Previous step summary ---"));
    }

    #[test]
    fn truncate_tail_chars_returns_input_under_cap() {
        assert_eq!(truncate_tail_chars("hi", 10), "hi");
    }

    #[test]
    fn truncate_tail_chars_returns_input_at_cap() {
        assert_eq!(truncate_tail_chars("hello", 5), "hello");
    }

    #[test]
    fn truncate_tail_chars_keeps_tail_when_over_cap() {
        assert_eq!(truncate_tail_chars("abcdef", 3), "def");
    }

    #[test]
    fn truncate_tail_chars_is_char_boundary_safe() {
        // Each emoji is 4 bytes but one char; the cap is in chars, not bytes.
        let s = "🦀🚀🐙";
        assert_eq!(truncate_tail_chars(s, 2), "🚀🐙");
    }
}
