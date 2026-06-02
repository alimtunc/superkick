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
    AgentCatalog, AgentProvider, EventKind, EventLevel, FailureClassification, FailureDisposition,
    LaunchReason, LaunchStepKind, LaunchTask, LaunchTaskId, LaunchTaskIntervention, LaunchTaskStep,
    LaunchTaskStepId, MemoryEntryId, RoleRouter, Run, RunId, RunPolicy, RunState, RunStep,
    RunnerMode, StepId, StepKey, StepResult, StepStatus, TriggerSource,
};
use superkick_storage::repo::{
    AgentSessionRepo, IssueWorkspaceContextRepoDyn, LaunchTaskInterventionRepo, LaunchTaskRepo,
    MemoryEntryRepoDyn, RunEventRepo, RunRepo, RunStepRepo, TranscriptRepo,
};

use crate::agent_spawn::{LaunchConfigInputs, build_launch_config, resolve_spawn_plan};
use crate::agent_supervisor::AgentSupervisor;
use crate::launch_task_context::{
    AppendError, LoadedWorkspaceContext, append_step_memory_entry, render_workspace_block,
    try_load_workspace_context,
};
use crate::launch_task_event_bus::{LaunchTaskEvent, LaunchTaskEventBus};
use crate::launch_task_executor::{StepLinks, StepOutcome, StepRunner};
use crate::linear_context::OptionalLinearClient;
use crate::protocol_adapter::{CodexAdapterOptions, CodexProtocolAdapter, MarkerError};
use crate::repo_cache::RepoCache;
use crate::session_bus::SessionBus;
use crate::step_engine::prompts::{PromptStepKind, step_body_for};
use crate::step_engine::{build_full_prompt, emit_event};
use crate::step_failure_classifier::{
    ClassifyInputs, GitDiffProbe, classify, classify_spawn_error,
};
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
pub struct RealStepRunnerDeps<R, ST, E, A, T, L, I>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    T: TranscriptRepo + 'static,
    L: LaunchTaskRepo + 'static,
    I: LaunchTaskInterventionRepo + 'static,
{
    pub run_repo: Arc<R>,
    pub step_repo: Arc<ST>,
    pub event_repo: Arc<E>,
    pub session_repo: Arc<A>,
    pub transcript_repo: Arc<T>,
    pub launch_task_repo: Arc<L>,
    pub issue_workspace_context_repo: Arc<dyn IssueWorkspaceContextRepoDyn>,
    pub memory_repo: Arc<dyn MemoryEntryRepoDyn>,
    pub intervention_repo: Arc<I>,
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
pub struct RealStepRunner<R, ST, E, A, T, L, I>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    T: TranscriptRepo + 'static,
    L: LaunchTaskRepo + 'static,
    I: LaunchTaskInterventionRepo + 'static,
{
    run_repo: Arc<R>,
    step_repo: Arc<ST>,
    event_repo: Arc<E>,
    launch_task_repo: Arc<L>,
    issue_workspace_context_repo: Arc<dyn IssueWorkspaceContextRepoDyn>,
    memory_repo: Arc<dyn MemoryEntryRepoDyn>,
    intervention_repo: Arc<I>,
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

impl<R, ST, E, A, T, L, I> RealStepRunner<R, ST, E, A, T, L, I>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    T: TranscriptRepo + 'static,
    L: LaunchTaskRepo + 'static,
    I: LaunchTaskInterventionRepo + 'static,
{
    pub fn new(deps: RealStepRunnerDeps<R, ST, E, A, T, L, I>) -> Self {
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
            issue_workspace_context_repo: deps.issue_workspace_context_repo,
            memory_repo: deps.memory_repo,
            intervention_repo: deps.intervention_repo,
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

    /// Materialise (or reuse) the shadow `Run` + working directory backing a
    /// Launch Task. Idempotent: subsequent steps for the same task reuse the
    /// in-memory cache without touching the DB. Task-level `base_branch` and
    /// `use_worktree` overrides take precedence over runner config defaults.
    async fn ensure_shadow_run(&self, task: &LaunchTask) -> Result<(RunId, PathBuf)> {
        {
            let map = self.shadow_runs.lock().await;
            if let Some(state) = map.get(&task.id) {
                return Ok((state.run_id, state.worktree.clone()));
            }
        }

        let effective_base = task
            .base_branch
            .as_deref()
            .unwrap_or(&self.base_branch)
            .to_string();
        let use_worktree = task.use_worktree.unwrap_or(true);

        let clone_url = crate::worktree::github_clone_url(&self.repo_slug);
        let bare_path = self
            .repo_cache
            .ensure(&self.repo_slug, &clone_url)
            .await
            .context("failed to ensure bare clone for launch task worktree")?;

        let repo_root = PathBuf::from(&self.config.runner.repo_root);

        let mut run = Run::new(
            task.linear_issue_id.clone(),
            task.linear_issue_id.clone(),
            self.repo_slug.clone(),
            TriggerSource::LaunchTask,
            superkick_core::ExecutionMode::FullAuto,
            effective_base.clone(),
            use_worktree,
            None,
        );
        run.transition_to(RunState::Preparing)
            .context("Queued → Preparing on shadow run must be valid")?;

        let work_path = if use_worktree {
            let wt_root = default_worktree_root(&repo_root);
            let wt_mgr = WorktreeManager::new(
                bare_path,
                wt_root,
                self.config.runner.worktree_prefix.clone(),
            )
            .await
            .context("failed to construct WorktreeManager for launch task")?;

            let WorktreeInfo { path, branch } = wt_mgr
                .create(run.id, &task.linear_issue_id, &effective_base)
                .await
                .with_context(|| {
                    format!("failed to create worktree for launch task {}", task.id)
                })?;

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
            path
        } else {
            run.worktree_path = Some(repo_root.to_string_lossy().into_owned());
            self.run_repo.insert(&run).await.with_context(|| {
                format!("failed to insert shadow run for launch task {}", task.id)
            })?;
            repo_root.clone()
        };

        info!(
            launch_task_id = %task.id,
            shadow_run_id = %run.id,
            work_path = %work_path.display(),
            use_worktree,
            base_branch = %effective_base,
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
            worktree: work_path.clone(),
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

    /// Append a clearly-labelled block listing every pending operator
    /// intervention. The heading is unambiguous so the agent treats the body
    /// as operator guidance rather than as part of the prior summary. Each
    /// entry is fenced with a numbered marker so two adjacent interventions
    /// remain distinguishable when the operator's body contains its own
    /// section headings.
    fn append_interventions(base: &mut String, interventions: &[LaunchTaskIntervention]) {
        if interventions.is_empty() {
            return;
        }
        base.push_str("\n\n--- Operator interventions ---\n");
        base.push_str(
            "The operator left the following requests for this step. Treat them as \
             authoritative additions to the brief above.\n",
        );
        for (idx, i) in interventions.iter().enumerate() {
            base.push_str(&format!(
                "\n[{}] from {} at {}:\n{}\n",
                idx + 1,
                i.author,
                i.created_at.to_rfc3339(),
                i.body
            ));
        }
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
        emit_event(
            &*self.event_repo,
            run_id,
            Some(run_step_id),
            EventKind::Error,
            EventLevel::Warn,
            format!("structured_result persist failed: {e}"),
        )
        .await;
    }

    /// Warn-not-fail: validation / storage errors here downgrade to a Warn
    /// event on the shadow run timeline; the step itself has already
    /// succeeded and we don't want to lose that.
    async fn append_ledger_for_step(
        &self,
        ctx: &StepCompletionContext<'_>,
        shadow_run_id: RunId,
        summary: &str,
    ) -> Vec<MemoryEntryId> {
        let Some(context_id) = ctx.workspace_context_id else {
            return Vec::new();
        };
        let result = append_step_memory_entry(
            &self.memory_repo,
            context_id,
            ctx.step.step_kind,
            Some(ctx.role.to_string()),
            summary,
        )
        .await;
        let (event_kind, ui_msg) = match result {
            Ok(Some(id)) => return vec![id],
            Ok(None) => return Vec::new(),
            Err(AppendError::CredentialLikely { kind }) => {
                warn!(
                    launch_task_step_id = %ctx.step.id,
                    redaction_kind = %kind,
                    "memory ledger write skipped — credential-shape text in step summary"
                );
                (
                    EventKind::AgentOutput,
                    format!(
                        "memory ledger write skipped: credential-shape text ({kind}) in step summary"
                    ),
                )
            }
            Err(AppendError::Validation(msg)) => {
                warn!(
                    launch_task_step_id = %ctx.step.id,
                    error = %msg,
                    "memory ledger write skipped — validation error"
                );
                (
                    EventKind::AgentOutput,
                    format!("memory ledger write skipped: {msg}"),
                )
            }
            Err(AppendError::Storage(e)) => {
                warn!(
                    launch_task_step_id = %ctx.step.id,
                    error = %e,
                    "memory ledger write failed — step still considered Completed"
                );
                (
                    EventKind::Error,
                    format!("memory ledger write failed: {e:#}"),
                )
            }
        };
        emit_event(
            &*self.event_repo,
            shadow_run_id,
            Some(ctx.run_step_id),
            event_kind,
            EventLevel::Warn,
            ui_msg,
        )
        .await;
        Vec::new()
    }

    async fn process_completion(
        &self,
        task: &LaunchTask,
        run: &mut Run,
        result: crate::agent_supervisor::AgentResult,
        ctx: StepCompletionContext<'_>,
    ) -> Result<StepOutcome> {
        let shadow_run_id = run.id;
        let links = StepLinks {
            run_id: Some(shadow_run_id),
            conversation_id: None,
            orchestrator_session_id: None,
        };

        let provider = result.session.provider;
        let marker_outcome: Result<Option<&StepResult>, &MarkerError> = match &result.step_result {
            Ok(opt) => Ok(opt.as_ref()),
            Err(err) => Err(err),
        };
        if let Ok(Some(sr)) = &marker_outcome {
            // Persist the agent's self-report before any classification side
            // effects so a mid-flight crash still leaves the row populated.
            self.persist_structured_result(
                shadow_run_id,
                ctx.run_step_id,
                ctx.step.id,
                (*sr).clone(),
            )
            .await;
        }

        let diff_probe = GitDiffProbe::new(ctx.worktree.to_path_buf())
            .probe_for(ctx.step.step_kind)
            .await;
        let classification = classify(ClassifyInputs {
            provider,
            role: ctx.role,
            step_kind: ctx.step.step_kind,
            session_exit_code: result.session.exit_code,
            lifecycle_phase: &result.lifecycle_phase,
            timeout_after: result.timeout_after,
            marker_outcome,
            transcript_hints: &result.transcript_hints,
            spawn_error: None,
            diff_probe: &diff_probe,
        });

        match classification {
            None => {
                let summary = match &result.step_result {
                    Ok(Some(sr)) => truncate_tail_chars(&sr.summary, SUMMARY_MAX_CHARS),
                    _ => String::new(),
                };
                self.finish_run_step(ctx.run_step_id, StepStatus::Succeeded, None)
                    .await;
                if matches!(ctx.step.step_kind, LaunchStepKind::Review)
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
                let memory_entry_ids = self
                    .append_ledger_for_step(&ctx, shadow_run_id, &summary)
                    .await;
                Ok(StepOutcome::Completed {
                    summary: Some(summary),
                    links,
                    memory_entry_ids,
                })
            }
            Some(c) => {
                // Mirror the verdict onto the shadow run_step so the runs
                // dashboard shows the step as terminal-failed in either
                // disposition; the executor decides the parent-task path.
                let reason = c.human_summary();
                self.finish_run_step(ctx.run_step_id, StepStatus::Failed, Some(reason))
                    .await;
                Ok(match c.disposition() {
                    FailureDisposition::NeedsHuman => StepOutcome::NeedsHuman {
                        classification: c,
                        links,
                    },
                    FailureDisposition::Failed => StepOutcome::Failed {
                        classification: c,
                        links,
                    },
                })
            }
        }
    }

    async fn resolve_workspace_context(
        &self,
        task: &LaunchTask,
    ) -> (Option<LoadedWorkspaceContext>, Option<String>) {
        let loaded = match try_load_workspace_context(
            &self.issue_workspace_context_repo,
            &self.memory_repo,
            &task.linear_issue_id,
        )
        .await
        {
            Ok(opt) => opt,
            Err(e) => {
                warn!(
                    launch_task_id = %task.id,
                    error = %e,
                    "failed to load workspace context — falling back to fresh-fetch snapshot"
                );
                None
            }
        };
        let block = loaded.as_ref().map(
            |LoadedWorkspaceContext {
                 context,
                 excerpts,
                 memory_entries,
             }| { render_workspace_block(context, excerpts, memory_entries) },
        );
        (loaded, block)
    }
}

/// Bundles per-step references that `process_completion` and the ledger
/// helper both consume — keeps both signatures under the
/// `clippy::too_many_arguments` threshold.
struct StepCompletionContext<'a> {
    step: &'a LaunchTaskStep,
    run_step_id: StepId,
    role: &'a str,
    worktree: &'a std::path::Path,
    workspace_context_id: Option<superkick_core::IssueWorkspaceContextId>,
}

impl<R, ST, E, A, T, L, I> StepRunner for RealStepRunner<R, ST, E, A, T, L, I>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    T: TranscriptRepo + 'static,
    L: LaunchTaskRepo + 'static,
    I: LaunchTaskInterventionRepo + 'static,
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
                    classification: FailureClassification::SpawnError {
                        detail: format!("shadow run setup failed: {e:#}"),
                    },
                    links: StepLinks::default(),
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

        let links_with_shadow = StepLinks {
            run_id: Some(shadow_run_id),
            conversation_id: None,
            orchestrator_session_id: None,
        };

        let mut run = match self.run_repo.get(shadow_run_id).await? {
            Some(run) => run,
            None => {
                return Ok(StepOutcome::Failed {
                    classification: FailureClassification::SpawnError {
                        detail: format!("shadow run {shadow_run_id} disappeared"),
                    },
                    links: links_with_shadow.clone(),
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
                    classification: FailureClassification::SpawnError {
                        detail: format!("run_step insert failed: {e:#}"),
                    },
                    links: links_with_shadow.clone(),
                });
            }
        };

        let router = RoleRouter::new(&self.catalog, &self.policy);
        let resolved = match router.resolve(&step.agent_name) {
            Ok(r) => r,
            Err(e) => {
                return Ok(StepOutcome::Failed {
                    classification: FailureClassification::SpawnError {
                        detail: format!("agent role '{}' resolution failed: {e}", step.agent_name),
                    },
                    links: links_with_shadow.clone(),
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
                    classification: FailureClassification::SpawnError {
                        detail: format!("MCP/Linear policy resolution failed: {e:#}"),
                    },
                    links: links_with_shadow.clone(),
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

        let (loaded_context, structured_block) = self.resolve_workspace_context(task).await;
        let context_block_for_prompt: Option<&str> = structured_block
            .as_deref()
            .or(spawn_plan.snapshot_block.as_deref());

        let pending_interventions = self
            .intervention_repo
            .list_pending_for_step(task.id, step.id)
            .await
            .unwrap_or_else(|e| {
                warn!(
                    launch_task_id = %task.id,
                    step_id = %step.id,
                    error = %e,
                    "failed to load pending interventions — continuing without them"
                );
                Vec::new()
            });

        let mut base_prompt =
            Self::build_base_prompt(task, step.step_kind, previous_summary.as_deref());
        Self::append_interventions(&mut base_prompt, &pending_interventions);
        let default_instructions = &self.config.launch_profile.default_instructions;
        let prompt = build_full_prompt(
            &base_prompt,
            Some(default_instructions.as_str()).filter(|s| !s.is_empty()),
            None,
            None,
            resolved.system_prompt.as_deref(),
            context_block_for_prompt,
        );

        // SUP-185: route Codex `ExecJson` steps through the structured adapter
        // (codex exec --json) so Activity/Tools/Logs see real provider events.
        // Every other (provider, mode) pair — including all Claude modes and
        // Codex interactive takeover — keeps the unchanged PTY supervisor path.
        let codex_structured = resolved.provider == AgentProvider::Codex
            && resolved.runner_mode == RunnerMode::ExecJson;
        // The structured path feeds the prompt to the adapter via stdin,
        // separately from the launch config, so it needs its own copy; the PTY
        // path moves the prompt straight into the config.
        let structured_prompt = codex_structured.then(|| prompt.clone());

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

        let spawn_result = match structured_prompt {
            Some(prompt) => {
                let adapter = CodexProtocolAdapter::with_options(CodexAdapterOptions {
                    codex_executable: Some(PathBuf::from(resolved.program.clone())),
                    model: resolved.model.clone(),
                    ..CodexAdapterOptions::default()
                });
                self.supervisor
                    .launch_codex_structured(adapter, launch_cfg, prompt)
                    .await
            }
            None => self.supervisor.launch(launch_cfg).await,
        };

        let (handle, join) = match spawn_result {
            Ok(pair) => pair,
            Err(e) => {
                return Ok(StepOutcome::Failed {
                    classification: classify_spawn_error(resolved.provider, &format!("{e:#}")),
                    links: links_with_shadow.clone(),
                });
            }
        };

        // Spawn succeeded → the agent process has the prompt. Mark every
        // injected intervention consumed. Doing this post-spawn (not
        // pre-prompt) keeps pending interventions queryable for retry if
        // the launch failed instead.
        if !pending_interventions.is_empty() {
            let ids: Vec<_> = pending_interventions.iter().map(|i| i.id).collect();
            let now = Utc::now();
            match self.intervention_repo.mark_consumed(&ids, now).await {
                Ok(updated) => {
                    for id in updated {
                        self.launch_task_bus
                            .publish(LaunchTaskEvent::InterventionConsumed {
                                task_id: task.id,
                                linear_issue_id: task.linear_issue_id.clone(),
                                intervention_id: id,
                                step_id: step.id,
                                consumed_at: now,
                            });
                    }
                }
                Err(e) => warn!(
                    launch_task_id = %task.id,
                    step_id = %step.id,
                    error = %e,
                    "failed to mark interventions consumed — they will re-inject on the next step"
                ),
            }
        }

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
            // LaunchTaskExecutor parks the Launch Task per the disposition
            // so SUP-120 retry can re-enter `NeedsHuman` steps. Terminal
            // Run.state is only reached on cancel or successful Review.
            Err(detail) => {
                self.finish_run_step(run_step_id, StepStatus::Failed, Some(detail.clone()))
                    .await;
                Ok(StepOutcome::Failed {
                    classification: FailureClassification::SpawnError { detail },
                    links: links_with_shadow.clone(),
                })
            }
            Ok(result) => {
                let ctx = StepCompletionContext {
                    step,
                    run_step_id,
                    role: &resolved.role,
                    worktree: &worktree,
                    workspace_context_id: loaded_context.as_ref().map(|lc| lc.context.id),
                };
                self.process_completion(task, &mut run, result, ctx).await
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
            base_branch: None,
            use_worktree: None,
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
                superkick_storage::SqliteLaunchTaskInterventionRepo,
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
                superkick_storage::SqliteLaunchTaskInterventionRepo,
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
                superkick_storage::SqliteLaunchTaskInterventionRepo,
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
                superkick_storage::SqliteLaunchTaskInterventionRepo,
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
            superkick_storage::SqliteLaunchTaskInterventionRepo,
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
            superkick_storage::SqliteLaunchTaskInterventionRepo,
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

    fn intervention(body: &str) -> LaunchTaskIntervention {
        LaunchTaskIntervention::new(LaunchTaskId::new(), None, None, body.into()).unwrap()
    }

    #[test]
    fn append_interventions_is_no_op_for_empty_list() {
        let mut base = String::from("BASE");
        RealStepRunner::<
            superkick_storage::SqliteRunRepo,
            superkick_storage::SqliteRunStepRepo,
            superkick_storage::SqliteRunEventRepo,
            superkick_storage::SqliteAgentSessionRepo,
            superkick_storage::SqliteTranscriptRepo,
            superkick_storage::SqliteLaunchTaskRepo,
            superkick_storage::SqliteLaunchTaskInterventionRepo,
        >::append_interventions(&mut base, &[]);
        assert_eq!(base, "BASE");
    }

    #[test]
    fn append_interventions_writes_a_labelled_block() {
        let mut base = String::from("BASE");
        let items = vec![
            intervention("watch the migrations"),
            intervention("rerun lint"),
        ];
        RealStepRunner::<
            superkick_storage::SqliteRunRepo,
            superkick_storage::SqliteRunStepRepo,
            superkick_storage::SqliteRunEventRepo,
            superkick_storage::SqliteAgentSessionRepo,
            superkick_storage::SqliteTranscriptRepo,
            superkick_storage::SqliteLaunchTaskRepo,
            superkick_storage::SqliteLaunchTaskInterventionRepo,
        >::append_interventions(&mut base, &items);
        assert!(base.starts_with("BASE"));
        assert!(base.contains("--- Operator interventions ---"));
        assert!(base.contains("watch the migrations"));
        assert!(base.contains("rerun lint"));
        assert!(base.contains("[1]"));
        assert!(base.contains("[2]"));
    }

    #[test]
    fn truncate_tail_chars_is_char_boundary_safe() {
        // Each emoji is 4 bytes but one char; the cap is in chars, not bytes.
        let s = "🦀🚀🐙";
        assert_eq!(truncate_tail_chars(s, 2), "🚀🐙");
    }
}
