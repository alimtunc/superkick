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

use std::collections::{HashMap, HashSet};
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
    AgentBackend, AgentCatalog, AgentOrigin, AgentProvider, CoreAgentDefinition, EventKind,
    EventLevel, FailureClassification, FailureDisposition, LaunchReason, LaunchStepKind,
    LaunchTask, LaunchTaskId, LaunchTaskIntervention, LaunchTaskStep, LaunchTaskStepId,
    LinearContextMode, MemoryEntryId, ReasoningEffort, ResolvedAgent, ResolvedMcpPolicy,
    ResolvedToolPolicy, ResumeKey, ReuseWorktree, RoleRouter, Run, RunId, RunPolicy, RunState,
    RunStep, RunnerMode, RunnerModeError, SkillArtifact, SkillDefinition, SkillKind, SkillSource,
    StepExecutor, StepId, StepKey, StepResult, StepStatus, TriggerSource,
};
use superkick_storage::repo::{
    AgentSessionRepo, IssueWorkspaceContextRepoDyn, LaunchTaskInterventionRepo, LaunchTaskRepo,
    MemoryEntryRepoDyn, RunEventRepo, RunRepo, RunStepRepo, SkillDefinitionRepo, TranscriptRepo,
};

use crate::agent_catalog_provider::AgentCatalogProvider;
use crate::agent_spawn::{
    BACKEND_DIRECTIVE_MARKER, LaunchConfigInputs, build_launch_config, resolve_spawn_plan,
};
use crate::agent_supervisor::AgentSupervisor;
use crate::launch_task_context::{
    AppendError, LoadedWorkspaceContext, append_step_memory_entry, render_workspace_block,
    try_load_workspace_context,
};
use crate::launch_task_event_bus::{LaunchTaskEvent, LaunchTaskEventBus};
use crate::launch_task_executor::{ShadowRunTerminal, StepLinks, StepOutcome, StepRunner};
use crate::launch_task_liveness::{ShadowRunRepos, terminalize_shadow_run};
use crate::linear_context::OptionalLinearClient;
use crate::protocol_adapter::{
    ClaudeAdapterOptions, ClaudeProtocolAdapter, CodexAdapterOptions, CodexProtocolAdapter,
    MarkerError,
};
use crate::repo_cache::RepoCache;
use crate::session_bus::SessionBus;
use crate::step_engine::prompts::{
    PromptStepKind, skill_body_instructions, step_body_for, step_result_contract_prompt,
};
use crate::step_engine::{build_full_prompt, emit_event};
use crate::step_failure_classifier::{
    ClassifyInputs, GitDiffProbe, capture_diff_snapshot, classify, classify_spawn_error,
};
use crate::worktree::{WorktreeInfo, WorktreeManager, default_worktree_root};

use crate::step_engine::DEFAULT_AGENT_TIMEOUT;

/// Cap on the persisted `LaunchTaskStep::summary`. The UI renders the column
/// inline so longer payloads are mostly noise; the full transcript lives in
/// the agent session anyway.
const SUMMARY_MAX_CHARS: usize = 512;

/// Resolve a step's agent recipe. Resolution order:
///
/// 1. **Agent-primary (`agent_ref` set, SUP-206 V2):** the named agent is the
///    single behaviour source — its provider/model/system_prompt/mcp_policy/
///    tool_policy/backend deep-carry from the project catalog. The step's
///    executor still selects the runner mode (and so the billing path) so a
///    profile authored for the structured/paid or background runner keeps it.
/// 2. **Dynamic (`executor == Some`, skill-first):** the step carries its own
///    provider/model/executor snapshot and resolves through a transient
///    single-entry catalog so the router still applies runner-mode validation
///    and the paid-SDK billing invariant.
/// 3. **Legacy v1-recipe (`executor == None`):** resolve by `agent_name`
///    against the project catalog.
fn resolve_step_agent(
    step: &LaunchTaskStep,
    catalog: &AgentCatalog,
    policy: &RunPolicy,
) -> Result<ResolvedAgent, String> {
    if let Some(agent_ref) = step.agent_ref.as_deref() {
        return resolve_catalog_agent(agent_ref, step, catalog, policy);
    }
    match step.executor {
        Some(executor) => resolve_dynamic_agent(step, executor),
        None => RoleRouter::new(catalog, policy)
            .resolve(&step.agent_name)
            .map_err(|e| format!("agent role '{}' resolution failed: {e}", step.agent_name)),
    }
}

/// Agent-primary resolution (branch 1 above). Deep-carries the catalog agent's
/// recipe, then lets the step's executor override the runner mode — one builtin
/// agent is shared by profiles that run it on different runners (e.g. the Claude
/// planner under both the paid structured and the subscription background
/// profiles), so the runner mode cannot live on the agent.
fn resolve_catalog_agent(
    agent_ref: &str,
    step: &LaunchTaskStep,
    catalog: &AgentCatalog,
    policy: &RunPolicy,
) -> Result<ResolvedAgent, String> {
    let resolved = RoleRouter::new(catalog, policy)
        .resolve(agent_ref)
        .map_err(|e| format!("step agent '{agent_ref}' resolution failed: {e}"))?;
    let Some(runner_mode) = step.executor.and_then(StepExecutor::runner_mode) else {
        return Ok(resolved);
    };
    let billing_override = catalog.get(agent_ref).and_then(|d| d.billing_profile);
    resolved.with_runner_mode(runner_mode, billing_override).map_err(
        |RunnerModeError::Incompatible { mode, provider }| {
            format!("step agent '{agent_ref}' runner mode {mode} is incompatible with provider {provider}")
        },
    )
}

/// Whether a resolved `(provider, mode)` pair runs on the structured
/// `ProtocolAdapter` path (real provider events into `run_events`) rather than
/// the PTY supervisor. The two structured executors are `CodexStructured`
/// (`Codex`, `ExecJson`) and the opt-in paid `ClaudeWorkflow` (`Claude`,
/// `PrintStreamJson`). Every other pair — subscription Claude (`InteractivePty`)
/// and Codex interactive takeover — stays on PTY. Subscription Claude staying
/// off this path is the `default_for(Claude) == InteractivePty` invariant.
fn is_structured_executor(provider: AgentProvider, mode: RunnerMode) -> bool {
    matches!(
        (provider, mode),
        (AgentProvider::Codex, RunnerMode::ExecJson)
            | (AgentProvider::Claude, RunnerMode::PrintStreamJson)
    )
}

/// Whether a resolved `(provider, mode)` pair runs on the `claude --bg`
/// background-session path (SUP — subscription autonomous runner). Claude-only;
/// it is neither structured (no provider event stream) nor PTY (no attachable
/// terminal). Superkick polls `claude agents --json` for state and produces an
/// `AgentResult` the same transition owner classifies.
fn is_background_executor(provider: AgentProvider, mode: RunnerMode) -> bool {
    matches!(
        (provider, mode),
        (AgentProvider::Claude, RunnerMode::BackgroundSession)
    )
}

fn resolve_dynamic_agent(
    step: &LaunchTaskStep,
    executor: StepExecutor,
) -> Result<ResolvedAgent, String> {
    let provider = step
        .provider
        .as_deref()
        .and_then(AgentProvider::from_cli_name)
        .ok_or_else(|| {
            format!(
                "dynamic step '{}' has no recognised provider",
                step.agent_name
            )
        })?;
    let runner_mode = executor.runner_mode().ok_or_else(|| {
        format!(
            "dynamic step '{}' uses an unimplemented executor ({executor})",
            step.agent_name
        )
    })?;
    // A custom skill's prompt template rides in as the system prompt; builtin
    // (installed) skills use the existing per-step-kind prompt path.
    let system_prompt = match &step.skill_source {
        Some(SkillSource::Prompt(template)) => Some(template.clone()),
        _ => None,
    };
    // Only Custom-kind installed skills name real Claude Code skills; Codex has no skill mechanism.
    let backend = match (&step.skill_source, provider, step.skill_kind) {
        (Some(SkillSource::Installed(name)), AgentProvider::Claude, Some(SkillKind::Custom)) => {
            Some(AgentBackend::ClaudeSkill {
                skills: vec![name.clone()],
            })
        }
        _ => None,
    };
    let def = CoreAgentDefinition {
        name: step.agent_name.clone(),
        provider,
        role: step.label.clone(),
        model: step.model.clone(),
        system_prompt,
        timeout_secs: None,
        max_turns: None,
        origin: AgentOrigin::Custom,
        linear_context: LinearContextMode::default(),
        mcp_policy: ResolvedMcpPolicy::default(),
        tool_policy: ResolvedToolPolicy::default(),
        backend,
        runner_mode: Some(runner_mode),
        // `None` lets `RoleRouter::resolve` apply the forced
        // claude+print_stream_json → agent_sdk_credits invariant.
        billing_profile: None,
        default_reasoning: ReasoningEffort::default(),
        enabled: true,
        // Dynamic steps drive behaviour from the step's skill_ref, not an
        // attached agent, so the transient agent carries no authoring metadata.
        skills: Vec::new(),
        avatar: None,
        description: None,
    };
    let catalog = AgentCatalog::from_definitions([def]);
    let policy = RunPolicy::allow_all();
    RoleRouter::new(&catalog, &policy)
        .resolve(&step.agent_name)
        .map_err(|e| format!("dynamic step '{}' resolution failed: {e}", step.agent_name))
}

/// `Some(name)` when a Codex step references a real (Custom-kind) installed
/// skill it cannot invoke — surfaced as an Info event on the run ledger.
fn unmapped_codex_skill(step: &LaunchTaskStep, provider: AgentProvider) -> Option<&str> {
    match (&step.skill_source, provider, step.skill_kind) {
        (Some(SkillSource::Installed(name)), AgentProvider::Codex, Some(SkillKind::Custom)) => {
            Some(name)
        }
        _ => None,
    }
}

/// The managed-skill id a step references, if any. Only `Installed` skills map
/// onto a `SkillDefinition` row (the value is the skill id); inline `Prompt`
/// steps carry their own template and have no file-backed body.
fn step_skill_id(step: &LaunchTaskStep) -> Option<&str> {
    match &step.skill_source {
        Some(SkillSource::Installed(id)) => Some(id.as_str()),
        _ => None,
    }
}

/// The skill id eligible for the lean `/name` interactive path: an
/// `InteractivePty` step whose `Installed` skill body was materialised on disk
/// this run. A body-less builtin (no SKILL.md written) returns `None` so the
/// caller falls back to the full self-contained prompt instead of sending a
/// `/name` directive that the worktree cannot resolve (a silent no-op).
fn lean_skill_id<'s>(step: &'s LaunchTaskStep, materialized: &HashSet<String>) -> Option<&'s str> {
    if step.executor != Some(StepExecutor::InteractivePty) {
        return None;
    }
    step_skill_id(step).filter(|id| materialized.contains(*id))
}

/// A skill id is only safe to interpolate into a filesystem path when it is a
/// plain slug: no separators, no `..`, no leading dot. Belt-and-suspenders —
/// core `validate()` already rejects bad ids, but materialisation writes into
/// the operator's real repo so a traversal here is a clobber/escape risk.
fn is_safe_skill_slug(id: &str) -> bool {
    !id.is_empty()
        && !id.starts_with('.')
        && !id.contains('/')
        && !id.contains('\\')
        && !id.contains("..")
}

/// The worktree-relative path a managed skill materialises to, or `None` when
/// the id is not a safe slug (refuse to build a traversal path).
fn skill_artifact_path(work_path: &std::path::Path, skill: &SkillDefinition) -> Option<PathBuf> {
    if !is_safe_skill_slug(&skill.id) {
        return None;
    }
    let path = match skill.artifact_kind {
        SkillArtifact::Skill => work_path
            .join(".claude/skills")
            .join(&skill.id)
            .join("SKILL.md"),
        SkillArtifact::Command => work_path
            .join(".claude/commands")
            .join(format!("{}.md", skill.id)),
    };
    Some(path)
}

/// Keep a worktree-reuse request only when its directory still exists on disk.
/// `None` (no reuse requested, or the directory vanished) means the caller mints
/// a fresh worktree instead.
fn surviving_reuse_worktree(reuse: Option<&ReuseWorktree>) -> Option<&ReuseWorktree> {
    reuse.filter(|reuse| std::fs::metadata(&reuse.path).is_ok())
}

/// Write `body` to `path`, creating parent dirs, only when the target does not
/// already exist. Returns `true` when written, `false` when a pre-existing file
/// is left untouched (a repo-native skill we must not clobber).
async fn write_skill_file(path: &std::path::Path, body: &str) -> Result<bool> {
    if tokio::fs::try_exists(path)
        .await
        .with_context(|| format!("probe skill file {}", path.display()))?
    {
        return Ok(false);
    }
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .with_context(|| format!("create skill dir {}", parent.display()))?;
    }
    tokio::fs::write(path, body)
        .await
        .with_context(|| format!("write skill file {}", path.display()))?;
    Ok(true)
}

/// Map a Launch Task kind to its playbook-engine-equivalent prompt body.
fn prompt_kind_for(kind: LaunchStepKind) -> PromptStepKind {
    match kind {
        LaunchStepKind::Plan => PromptStepKind::Plan,
        LaunchStepKind::Implement => PromptStepKind::Implement,
        LaunchStepKind::Review => PromptStepKind::Review,
    }
}

/// Cached substrate per LaunchTask — created lazily on the first step so
/// retries and re-runs reuse the same worktree + shadow `Run`.
struct ShadowTaskState {
    run_id: RunId,
    worktree: PathBuf,
    /// Ids of managed skills whose body is present on disk in the worktree
    /// (materialised this run or already repo-native). Only these may take the
    /// lean `/name` interactive path; everything else falls back to the full
    /// self-contained prompt so an un-imported `/ticket` step is not a no-op.
    materialized_skills: HashSet<String>,
}

/// Construction dependencies for `RealStepRunner`. Mirrors the
/// `StepEngineDeps` pattern so the wiring stays one struct literal per call
/// site.
pub struct RealStepRunnerDeps<R, ST, E, A, T, L, I, K>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    T: TranscriptRepo + 'static,
    L: LaunchTaskRepo + 'static,
    I: LaunchTaskInterventionRepo + 'static,
    K: SkillDefinitionRepo + 'static,
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
    /// Source of managed-skill bodies materialised into the worktree at setup.
    pub skill_repo: Arc<K>,
    pub registry: Arc<crate::pty_session::PtySessionRegistry>,
    pub session_bus: Option<Arc<SessionBus>>,
    pub launch_task_bus: Arc<LaunchTaskEventBus>,
    pub repo_cache: RepoCache,
    pub config: SuperkickConfig,
    /// DB-backed agent catalog, shared with the write API so a custom-agent
    /// edit is visible to the next launch without a restart.
    pub agent_catalog: AgentCatalogProvider,
    pub linear_client: OptionalLinearClient,
    pub repo_slug: String,
    pub base_branch: String,
}

/// Production `StepRunner` that spawns a real agent for every Launch Task
/// step.
pub struct RealStepRunner<R, ST, E, A, T, L, I, K>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    T: TranscriptRepo + 'static,
    L: LaunchTaskRepo + 'static,
    I: LaunchTaskInterventionRepo + 'static,
    K: SkillDefinitionRepo + 'static,
{
    run_repo: Arc<R>,
    step_repo: Arc<ST>,
    event_repo: Arc<E>,
    /// Kept alongside the supervisor's copy so reconciliation can finalize
    /// orphaned sessions (Running with a dead pid) for a shadow run.
    session_repo: Arc<A>,
    launch_task_repo: Arc<L>,
    issue_workspace_context_repo: Arc<dyn IssueWorkspaceContextRepoDyn>,
    memory_repo: Arc<dyn MemoryEntryRepoDyn>,
    intervention_repo: Arc<I>,
    skill_repo: Arc<K>,
    launch_task_bus: Arc<LaunchTaskEventBus>,
    supervisor: AgentSupervisor<A, E, T>,
    repo_cache: RepoCache,
    agent_catalog: AgentCatalogProvider,
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

impl<R, ST, E, A, T, L, I, K> RealStepRunner<R, ST, E, A, T, L, I, K>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    T: TranscriptRepo + 'static,
    L: LaunchTaskRepo + 'static,
    I: LaunchTaskInterventionRepo + 'static,
    K: SkillDefinitionRepo + 'static,
{
    pub fn new(deps: RealStepRunnerDeps<R, ST, E, A, T, L, I, K>) -> Self {
        let session_repo = Arc::clone(&deps.session_repo);
        let mut supervisor = AgentSupervisor::new(
            deps.session_repo,
            Arc::clone(&deps.event_repo),
            deps.transcript_repo,
            deps.registry,
        );
        if let Some(bus) = deps.session_bus {
            supervisor = supervisor.with_lifecycle_bus(bus);
        }
        let policy = deps.config.base_run_policy();
        let mcp_registry = deps.config.effective_mcp_servers();
        Self {
            run_repo: deps.run_repo,
            step_repo: deps.step_repo,
            event_repo: deps.event_repo,
            session_repo,
            launch_task_repo: deps.launch_task_repo,
            issue_workspace_context_repo: deps.issue_workspace_context_repo,
            memory_repo: deps.memory_repo,
            intervention_repo: deps.intervention_repo,
            skill_repo: deps.skill_repo,
            launch_task_bus: deps.launch_task_bus,
            supervisor,
            repo_cache: deps.repo_cache,
            agent_catalog: deps.agent_catalog,
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
    async fn ensure_shadow_run(
        &self,
        task: &LaunchTask,
    ) -> Result<(RunId, PathBuf, HashSet<String>)> {
        {
            let map = self.shadow_runs.lock().await;
            if let Some(state) = map.get(&task.id) {
                return Ok((
                    state.run_id,
                    state.worktree.clone(),
                    state.materialized_skills.clone(),
                ));
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

        // A git worktree cannot be added twice for an already-checked-out
        // branch, so reuse runs against the surviving directory and skips
        // `WorktreeManager::create`. If the directory vanished between detect
        // and run, fall back to minting a fresh worktree rather than failing.
        let reuse_worktree = surviving_reuse_worktree(task.reuse_worktree.as_ref());
        if reuse_worktree.is_none() && task.reuse_worktree.is_some() {
            warn!(
                launch_task_id = %task.id,
                "reusable worktree vanished before launch; creating a fresh one",
            );
        }

        let work_path = if let Some(reuse) = reuse_worktree {
            let path = PathBuf::from(&reuse.path);
            run.worktree_path = Some(reuse.path.clone());
            run.branch_name = Some(reuse.branch.clone());
            self.run_repo.insert(&run).await.with_context(|| {
                format!("failed to insert shadow run for launch task {}", task.id)
            })?;
            path
        } else if use_worktree {
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

        // Skills invoked via `/name` need their file on disk before any step
        // runs, so the LLM can read it rather than have the body inlined into
        // the prompt. Warn-not-fail: a write error degrades the step to the
        // full self-contained prompt path, which the lean gate selects below.
        let materialized_skills = self.materialize_skills(task, &work_path).await;

        self.publish_shadow_run_state(task, run.id, run.state);

        let mut map = self.shadow_runs.lock().await;
        // A concurrent task call may have raced us — the first writer wins
        // and a racing later worktree is leaked. In practice the executor
        // calls the runner sequentially per task so this branch is
        // unreachable; the defensive check keeps the invariant explicit.
        let entry = map.entry(task.id).or_insert(ShadowTaskState {
            run_id: run.id,
            worktree: work_path.clone(),
            materialized_skills,
        });
        Ok((
            entry.run_id,
            entry.worktree.clone(),
            entry.materialized_skills.clone(),
        ))
    }

    /// Write every file-backed managed skill referenced by the task's steps
    /// into the worktree (`.claude/skills/<id>/SKILL.md` or
    /// `.claude/commands/<id>.md`), never clobbering a repo-native file.
    /// Returns the ids whose body is present on disk afterwards (written here or
    /// already existing) — the lean `/name` path is gated on that set. Each
    /// failure is logged + emitted as a Warn but never aborts setup: a missing
    /// skill file degrades the step to the full prompt, not a crashed run.
    async fn materialize_skills(
        &self,
        task: &LaunchTask,
        work_path: &std::path::Path,
    ) -> HashSet<String> {
        let mut materialized = HashSet::new();
        let steps = match self.launch_task_repo.list_steps(task.id).await {
            Ok(steps) => steps,
            Err(e) => {
                warn!(
                    launch_task_id = %task.id,
                    error = %e,
                    "failed to list steps for skill materialisation — skipping"
                );
                return materialized;
            }
        };
        // Agent-primary steps (`agent_ref` set) materialise the agent's attached
        // skills — the agent is the single behaviour source, so the step's own
        // `skill_ref` is ignored. Skill-first steps keep materialising their
        // referenced skill exactly as before.
        let agent_catalog = self.agent_catalog.snapshot();
        let mut wanted: Vec<String> = Vec::new();
        for step in steps.iter().filter(|s| s.enabled) {
            match step
                .agent_ref
                .as_deref()
                .and_then(|name| agent_catalog.get(name))
            {
                Some(def) => wanted.extend(def.skills.iter().cloned()),
                None => wanted.extend(step_skill_id(step).map(str::to_string)),
            }
        }
        wanted.sort_unstable();
        wanted.dedup();
        if wanted.is_empty() {
            return materialized;
        }

        let definitions = match self.skill_repo.list().await {
            Ok(defs) => defs,
            Err(e) => {
                warn!(
                    launch_task_id = %task.id,
                    error = %e,
                    "failed to load skill definitions for materialisation — skipping"
                );
                return materialized;
            }
        };
        // `wanted` is sorted + deduped above, so a binary search beats the
        // linear scan and reads clearer than the nested `any`.
        for skill in definitions
            .iter()
            .filter(|d| wanted.binary_search(&d.id).is_ok())
        {
            // Whitespace-only bodies count as bodyless everywhere (the lean and
            // structured prompt paths both gate on `!trim().is_empty()`), so a
            // blank skill never materialises a `/name`-resolvable file.
            let Some(body) = skill.body.as_deref().filter(|b| !b.trim().is_empty()) else {
                continue;
            };
            let Some(path) = skill_artifact_path(work_path, skill) else {
                warn!(
                    launch_task_id = %task.id,
                    skill_id = %skill.id,
                    "refusing to materialise managed skill with unsafe id — skipping"
                );
                continue;
            };
            match write_skill_file(&path, body).await {
                Ok(true) => {
                    materialized.insert(skill.id.clone());
                }
                Ok(false) => {
                    // A repo-native skill file already occupies the path. Leave
                    // it untouched but treat its presence as materialised so the
                    // lean `/name` path still resolves to the on-disk body.
                    materialized.insert(skill.id.clone());
                }
                Err(e) => {
                    warn!(
                        launch_task_id = %task.id,
                        skill_id = %skill.id,
                        path = %path.display(),
                        error = %e,
                        "failed to materialise managed skill into worktree"
                    );
                }
            }
        }
        materialized
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

    /// The editable `body` of the managed skill a step references, if any.
    /// Used to drive the structured (non-lean) prompt straight from the skill
    /// body so an operator edit changes behaviour. A load error degrades to
    /// `None` (the hardcoded per-kind body), warning rather than failing the
    /// step.
    async fn step_skill_body(
        &self,
        task_id: LaunchTaskId,
        step: &LaunchTaskStep,
    ) -> Option<String> {
        let id = step_skill_id(step)?;
        match self.skill_repo.get(id).await {
            Ok(def) => def.and_then(|d| d.body).filter(|b| !b.trim().is_empty()),
            Err(e) => {
                warn!(
                    launch_task_id = %task_id,
                    skill_id = %id,
                    error = %e,
                    "failed to load skill body — falling back to the hardcoded step body"
                );
                None
            }
        }
    }

    /// Build the base prompt for one step. When the step's skill carries an
    /// editable `body`, that body *is* the instruction block (so editing the
    /// skill changes behaviour on this structured path); a body-less legacy
    /// step falls back to the hardcoded per-kind wording in
    /// `step_engine::prompts`. Either way the guardrail + completion contract
    /// are appended in one place so the two callers cannot drift.
    fn build_base_prompt(
        task: &LaunchTask,
        step_kind: LaunchStepKind,
        skill_body: Option<&str>,
        previous_summary: Option<&str>,
    ) -> String {
        let preamble = format!(
            "You are working on Linear issue {issue} as part of an automated \
             Plan → Implement → Review run.",
            issue = task.linear_issue_id,
        );
        let body = match skill_body.filter(|b| !b.trim().is_empty()) {
            Some(b) => skill_body_instructions(b),
            None => step_body_for(prompt_kind_for(step_kind)),
        };
        let mut prompt = format!("{preamble}\n\n{body}");
        if let Some(summary) = previous_summary.filter(|s| !s.is_empty()) {
            prompt.push_str("\n\n--- Previous step summary ---\n");
            prompt.push_str(summary);
        }
        prompt
    }

    /// Lean stdin payload for a managed skill driving an interactive REPL: the
    /// `/<skill>` directive plus the issue ref and a one-line pointer, keeping
    /// the STEP_RESULT completion contract (3a's mid-stream marker needs it) but
    /// dropping the verbose step body, previous-summary, and memory ledger. The
    /// skill's body is materialised to disk, so the LLM reads it via the slash
    /// command instead of having it inlined here.
    ///
    /// The prompt already carries its own `/{skill}` directive, so it leads with
    /// [`BACKEND_DIRECTIVE_MARKER`] to suppress the second directive
    /// `apply_claude_backend` would otherwise prepend for the step's
    /// `ClaudeSkill` backend — a double invocation of the same skill.
    fn lean_interactive_prompt(task: &LaunchTask, skill_id: &str) -> String {
        format!(
            "{BACKEND_DIRECTIVE_MARKER}\n\
             /{skill_id} {issue}\n\n\
             Work Linear issue {issue} end to end using the `/{skill_id}` skill. \
             Follow that skill's instructions; do not wait for further input.\n\n\
             {contract}",
            issue = task.linear_issue_id,
            contract = step_result_contract_prompt(),
        )
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
                    Ok(Some(sr)) => crate::text::tail_chars(&sr.summary, SUMMARY_MAX_CHARS),
                    _ => String::new(),
                };
                self.finish_run_step(ctx.run_step_id, StepStatus::Succeeded, None)
                    .await;
                let memory_entry_ids = self
                    .append_ledger_for_step(&ctx, shadow_run_id, &summary)
                    .await;
                Ok(StepOutcome::Completed {
                    summary: Some(summary),
                    links,
                    memory_entry_ids,
                })
            }
            // SUP-191 — a mid-turn timeout becomes `TimedOut` (not a plain
            // `NeedsHuman` park) so the executor can run the auto-resume loop.
            // We capture the worktree diff snapshot for the no-progress gate
            // and surface the Codex resume key the structured path recorded.
            Some(classification @ FailureClassification::Timeout { .. }) => {
                let reason = classification.human_summary();
                self.finish_run_step(ctx.run_step_id, StepStatus::Failed, Some(reason))
                    .await;
                let diff_snapshot = capture_diff_snapshot(ctx.worktree.to_path_buf()).await;
                Ok(StepOutcome::TimedOut {
                    classification,
                    links,
                    resume_key: result.resume_key,
                    diff_snapshot,
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

impl<R, ST, E, A, T, L, I, K> StepRunner for RealStepRunner<R, ST, E, A, T, L, I, K>
where
    R: RunRepo + 'static,
    ST: RunStepRepo + 'static,
    E: RunEventRepo + 'static,
    A: AgentSessionRepo + 'static,
    T: TranscriptRepo + 'static,
    L: LaunchTaskRepo + 'static,
    I: LaunchTaskInterventionRepo + 'static,
    K: SkillDefinitionRepo + 'static,
{
    async fn run_step(
        &self,
        task: &LaunchTask,
        step: &LaunchTaskStep,
        resume: Option<ResumeKey>,
        cancel: CancellationToken,
    ) -> Result<StepOutcome> {
        let (shadow_run_id, worktree, materialized_skills) =
            match self.ensure_shadow_run(task).await {
                Ok(triple) => triple,
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

        let catalog = self.agent_catalog.snapshot();
        let resolved = match resolve_step_agent(step, &catalog, &self.policy) {
            Ok(r) => r,
            Err(detail) => {
                return Ok(StepOutcome::Failed {
                    classification: FailureClassification::SpawnError { detail },
                    links: links_with_shadow.clone(),
                });
            }
        };

        if let Some(name) = unmapped_codex_skill(step, resolved.provider) {
            emit_event(
                &*self.event_repo,
                shadow_run_id,
                Some(run_step_id),
                EventKind::AgentOutput,
                EventLevel::Info,
                format!(
                    "installed skill '{name}' has no codex mechanism; running generic step prompt"
                ),
            )
            .await;
        }

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

        // A managed skill on an interactive REPL gets the lean `/name` directive
        // (the body is on disk) instead of the full body + ledger + scaffolding,
        // which would otherwise flood the session and never let it self-complete.
        let lean_skill = lean_skill_id(step, &materialized_skills);
        let prompt = match lean_skill {
            Some(skill_id) => {
                let mut base = Self::lean_interactive_prompt(task, skill_id);
                Self::append_interventions(&mut base, &pending_interventions);
                base
            }
            None => {
                let skill_body = self.step_skill_body(task.id, step).await;
                let mut base_prompt = Self::build_base_prompt(
                    task,
                    step.step_kind,
                    skill_body.as_deref(),
                    previous_summary.as_deref(),
                );
                Self::append_interventions(&mut base_prompt, &pending_interventions);
                let default_instructions = &self.config.launch_profile.default_instructions;
                build_full_prompt(
                    &base_prompt,
                    Some(default_instructions.as_str()).filter(|s| !s.is_empty()),
                    None,
                    None,
                    resolved.system_prompt.as_deref(),
                    context_block_for_prompt,
                )
            }
        };

        // SUP-185/SUP-201: route structured executors through their
        // `ProtocolAdapter` — `(Codex, ExecJson)` via `codex exec --json`,
        // `(Claude, PrintStreamJson)` via `claude --print --output-format
        // stream-json` — so Activity/Tools/Logs see real provider events. Every
        // other (provider, mode) pair — subscription Claude and Codex/Claude
        // interactive takeover — keeps the unchanged PTY supervisor path.
        let structured = is_structured_executor(resolved.provider, resolved.runner_mode);
        let background = is_background_executor(resolved.provider, resolved.runner_mode);
        // The structured and background paths feed the prompt to their driver
        // separately from the launch config, so each needs its own copy; the PTY
        // path moves the prompt straight into the config.
        let structured_prompt = structured.then(|| prompt.clone());
        let background_prompt = background.then(|| prompt.clone());

        // Legacy catalog steps (executor None) never carry reasoning, so their
        // argv stays byte-for-byte unchanged.
        let step_reasoning = step.executor.and(step.reasoning);

        let mut launch_cfg = build_launch_config(
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
                reasoning: step_reasoning,
            },
        );
        launch_cfg.idle_timeout = self
            .config
            .runner
            .agent_idle_timeout_secs
            .map(Duration::from_secs);

        // The PTY path registers an attachable session; pulse `StepSessionLive`
        // the moment that happens so the cockpit shows a live session instead of
        // an indistinguishable "running". The structured and background paths
        // have no attachable PTY, so they leave the hook unset.
        if structured_prompt.is_none() && background_prompt.is_none() {
            let bus = Arc::clone(&self.launch_task_bus);
            let task_id = task.id;
            let linear_issue_id = task.linear_issue_id.clone();
            let step_id = step.id;
            launch_cfg.session_live = Some(Box::new(move || {
                bus.publish(LaunchTaskEvent::StepSessionLive {
                    task_id,
                    linear_issue_id,
                    step_id,
                    run_id: shadow_run_id,
                    at: Utc::now(),
                });
            }));
        }

        let spawn_result = if let Some(bg_prompt) = background_prompt {
            // Subscription background runner: `claude --bg` from the worktree
            // cwd. Not resumable in this ticket (auto-resume budget is 0 for
            // ClaudeBackground), so any stray `resume` key is unused.
            let cli =
                crate::claude_background::RealClaudeBackgroundCli::new(resolved.program.clone());
            let name = format!("superkick-{run_step_id}");
            self.supervisor
                .launch_claude_background(
                    cli,
                    launch_cfg,
                    bg_prompt,
                    name,
                    crate::agent_supervisor::background::DEFAULT_POLL_INTERVAL,
                )
                .await
        } else {
            match structured_prompt {
                // SUP-185/SUP-201: a structured (provider, mode) pair drives its
                // adapter. `resume` continues a prior timed-out segment on the SAME
                // structured path — `codex exec resume <thread_id>` for Codex,
                // `claude --resume <session_id>` for Claude (SUP-191). A resume the
                // CLI cannot honour fails closed as a structured `Failure`; it is
                // never silently dropped onto the PTY supervisor.
                Some(prompt) => match resolved.provider {
                    AgentProvider::Codex => {
                        let adapter = CodexProtocolAdapter::with_options(CodexAdapterOptions {
                            codex_executable: Some(PathBuf::from(resolved.program.clone())),
                            model: resolved.model.clone(),
                            reasoning_effort: step_reasoning,
                            ..CodexAdapterOptions::default()
                        });
                        self.supervisor
                            .launch_codex_structured(adapter, launch_cfg, prompt, resume)
                            .await
                    }
                    AgentProvider::Claude => {
                        let adapter = ClaudeProtocolAdapter::with_options(ClaudeAdapterOptions {
                            claude_executable: Some(PathBuf::from(resolved.program.clone())),
                            model: resolved.model.clone(),
                            reasoning_effort: step_reasoning,
                            ..ClaudeAdapterOptions::default()
                        });
                        self.supervisor
                            .launch_claude_structured(adapter, launch_cfg, prompt, resume)
                            .await
                    }
                },
                None => {
                    // The PTY path has no resume mechanic, so a stray resume key
                    // here is dropped (unreachable in practice — resume keys only
                    // come from a structured step's own timeouts).
                    if resume.is_some() {
                        warn!(
                            launch_task_id = %task.id,
                            step_id = %step.id,
                            "resume key supplied for a non-structured step — ignoring, running fresh"
                        );
                    }
                    self.supervisor.launch(launch_cfg).await
                }
            }
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
                self.process_completion(&mut run, result, ctx).await
            }
        }
    }

    /// The runner owns shadow `Run`/`RunStep` state, so this is the single place
    /// that write happens during reconciliation; the executor never touches
    /// `RunState` itself.
    async fn finalize_shadow_run(
        &self,
        run_id: RunId,
        terminal: ShadowRunTerminal,
        reason: &str,
    ) -> Result<()> {
        terminalize_shadow_run(
            ShadowRunRepos {
                run: &*self.run_repo,
                step: &*self.step_repo,
                session: &*self.session_repo,
                event: &*self.event_repo,
                launch_task: &*self.launch_task_repo,
            },
            &self.launch_task_bus,
            run_id,
            terminal,
            reason,
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use chrono::Utc;
    use superkick_core::{LaunchRecipe, LaunchTaskStatus, LaunchTaskStepStatus};

    #[test]
    fn surviving_reuse_worktree_keeps_existing_dir() {
        let dir = tempfile::tempdir().expect("tempdir");
        let reuse = ReuseWorktree {
            path: dir.path().to_string_lossy().into_owned(),
            branch: "alimtunc/sup-1".into(),
        };
        assert_eq!(surviving_reuse_worktree(Some(&reuse)), Some(&reuse));
    }

    #[test]
    fn surviving_reuse_worktree_drops_missing_dir() {
        let reuse = ReuseWorktree {
            path: "/definitely/not/a/real/worktree".into(),
            branch: "alimtunc/sup-1".into(),
        };
        assert_eq!(surviving_reuse_worktree(Some(&reuse)), None);
    }

    #[test]
    fn surviving_reuse_worktree_passes_through_none() {
        assert_eq!(surviving_reuse_worktree(None), None);
    }

    /// SUP-201: the structured-routing matrix. The two structured executors run
    /// on the `ProtocolAdapter` path; subscription Claude (`InteractivePty`) and
    /// interactive takeover stay on the PTY supervisor — the
    /// `default_for(Claude) == InteractivePty` "keeps Claude off the paid path"
    /// invariant, enforced at the routing seam.
    #[test]
    fn is_structured_executor_routes_only_the_two_structured_pairs() {
        assert!(
            is_structured_executor(AgentProvider::Codex, RunnerMode::ExecJson),
            "Codex ExecJson is the existing structured path"
        );
        assert!(
            is_structured_executor(AgentProvider::Claude, RunnerMode::PrintStreamJson),
            "Claude PrintStreamJson (claude_workflow) is now structured"
        );
        assert!(
            !is_structured_executor(AgentProvider::Claude, RunnerMode::InteractivePty),
            "subscription Claude must stay on the PTY supervisor"
        );
        assert!(
            !is_structured_executor(AgentProvider::Codex, RunnerMode::InteractivePty),
            "Codex interactive takeover must stay on the PTY supervisor"
        );
    }

    fn dynamic_step(
        provider: &str,
        executor: StepExecutor,
        skill_source: Option<SkillSource>,
        skill_kind: Option<SkillKind>,
    ) -> LaunchTaskStep {
        let now = Utc::now();
        LaunchTaskStep {
            id: LaunchTaskStepId::new(),
            launch_task_id: LaunchTaskId::new(),
            sequence: 1,
            step_kind: LaunchStepKind::Implement,
            agent_name: "implement".into(),
            agent_ref: None,
            provider: Some(provider.into()),
            model: None,
            mode: None,
            label: Some("Implement".into()),
            skill_source,
            skill_kind,
            reasoning: None,
            executor: Some(executor),
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
            created_at: now,
            updated_at: now,
        }
    }

    fn agent_primary_step(agent_ref: &str, executor: StepExecutor) -> LaunchTaskStep {
        LaunchTaskStep {
            agent_ref: Some(agent_ref.into()),
            ..dynamic_step("codex", executor, None, None)
        }
    }

    #[test]
    fn agent_ref_deep_carries_planner_linear_mcp() {
        use superkick_core::{CODEX_PLAN, LINEAR_MCP_SERVER_NAME, McpMode};
        let catalog = AgentCatalog::from_definitions(CoreAgentDefinition::builtins());
        let policy = RunPolicy::allow_all();
        let step = agent_primary_step(CODEX_PLAN, StepExecutor::CodexStructured);
        let resolved = resolve_step_agent(&step, &catalog, &policy).expect("resolves");
        assert_eq!(resolved.mcp_policy.mode, McpMode::Servers);
        assert!(
            resolved
                .mcp_policy
                .servers
                .iter()
                .any(|s| s == LINEAR_MCP_SERVER_NAME),
            "planner deep-carries the Linear MCP under agent-primary launch"
        );
        assert_eq!(resolved.runner_mode, RunnerMode::ExecJson);
    }

    #[test]
    fn agent_ref_deep_carries_reviewer_tool_deny() {
        use superkick_core::CODEX_REVIEW;
        let catalog = AgentCatalog::from_definitions(CoreAgentDefinition::builtins());
        let policy = RunPolicy::allow_all();
        let step = agent_primary_step(CODEX_REVIEW, StepExecutor::CodexStructured);
        let resolved = resolve_step_agent(&step, &catalog, &policy).expect("resolves");
        let deny = resolved.tool_policy.deny.expect("reviewer denies tools");
        assert!(deny.iter().any(|t| t == "bash"));
        assert!(deny.iter().any(|t| t == "write"));
    }

    #[test]
    fn agent_ref_executor_selects_the_runner_mode_and_billing() {
        use superkick_core::{BillingProfile, CLAUDE_PLAN};
        let catalog = AgentCatalog::from_definitions(CoreAgentDefinition::builtins());
        let policy = RunPolicy::allow_all();
        // The one Claude planner agent runs on the paid structured runner here…
        let paid = agent_primary_step(CLAUDE_PLAN, StepExecutor::ClaudeWorkflow);
        let resolved = resolve_step_agent(&paid, &catalog, &policy).expect("resolves");
        assert_eq!(resolved.runner_mode, RunnerMode::PrintStreamJson);
        assert_eq!(resolved.billing_profile, BillingProfile::AgentSdkCredits);
        // …and on the subscription background runner there — the runner mode
        // rides on the step's executor, not the (shared) agent.
        let bg = agent_primary_step(CLAUDE_PLAN, StepExecutor::ClaudeBackground);
        let resolved_bg = resolve_step_agent(&bg, &catalog, &policy).expect("resolves");
        assert_eq!(resolved_bg.runner_mode, RunnerMode::BackgroundSession);
        assert_eq!(resolved_bg.billing_profile, BillingProfile::Subscription);
    }

    #[test]
    fn resolve_dynamic_agent_claude_custom_installed_skill_sets_claude_skill_backend() {
        let step = dynamic_step(
            "claude",
            StepExecutor::InteractivePty,
            Some(SkillSource::Installed("ticket".into())),
            Some(SkillKind::Custom),
        );
        let resolved =
            resolve_dynamic_agent(&step, StepExecutor::InteractivePty).expect("resolves");
        assert_eq!(
            resolved.backend,
            Some(AgentBackend::ClaudeSkill {
                skills: vec!["ticket".into()],
            })
        );
        assert!(resolved.system_prompt.is_none());
    }

    #[test]
    fn resolve_dynamic_agent_claude_recipe_kind_skill_keeps_generic_backend() {
        let step = dynamic_step(
            "claude",
            StepExecutor::InteractivePty,
            Some(SkillSource::Installed("plan".into())),
            Some(SkillKind::Plan),
        );
        let resolved =
            resolve_dynamic_agent(&step, StepExecutor::InteractivePty).expect("resolves");
        assert!(resolved.backend.is_none());
    }

    #[test]
    fn resolve_dynamic_agent_claude_degraded_skill_ref_keeps_generic_backend() {
        let step = dynamic_step(
            "claude",
            StepExecutor::InteractivePty,
            Some(SkillSource::Installed("plann".into())),
            None,
        );
        let resolved =
            resolve_dynamic_agent(&step, StepExecutor::InteractivePty).expect("resolves");
        assert!(resolved.backend.is_none());
    }

    #[test]
    fn resolve_dynamic_agent_codex_installed_skill_keeps_generic_backend() {
        let step = dynamic_step(
            "codex",
            StepExecutor::CodexStructured,
            Some(SkillSource::Installed("ticket".into())),
            Some(SkillKind::Custom),
        );
        let resolved =
            resolve_dynamic_agent(&step, StepExecutor::CodexStructured).expect("resolves");
        assert!(resolved.backend.is_none());
    }

    #[test]
    fn resolve_dynamic_agent_prompt_skill_rides_as_system_prompt_without_backend() {
        let step = dynamic_step(
            "claude",
            StepExecutor::InteractivePty,
            Some(SkillSource::Prompt("custom brief".into())),
            Some(SkillKind::Custom),
        );
        let resolved =
            resolve_dynamic_agent(&step, StepExecutor::InteractivePty).expect("resolves");
        assert!(resolved.backend.is_none());
        assert_eq!(resolved.system_prompt.as_deref(), Some("custom brief"));
    }

    #[test]
    fn resolve_dynamic_agent_interactive_pty_keeps_the_default_wall_clock() {
        // Reverted SUP regression: an InteractivePty step no longer carries a 4h
        // wall clock — it falls back to the configured default like every step.
        let step = dynamic_step(
            "claude",
            StepExecutor::InteractivePty,
            Some(SkillSource::Installed("ticket".into())),
            Some(SkillKind::Custom),
        );
        let resolved =
            resolve_dynamic_agent(&step, StepExecutor::InteractivePty).expect("resolves");
        assert!(resolved.timeout.is_none());
    }

    #[test]
    fn unmapped_codex_skill_fires_only_for_codex_custom_installed_skills() {
        let codex_custom = dynamic_step(
            "codex",
            StepExecutor::CodexStructured,
            Some(SkillSource::Installed("ticket".into())),
            Some(SkillKind::Custom),
        );
        assert_eq!(
            unmapped_codex_skill(&codex_custom, AgentProvider::Codex),
            Some("ticket")
        );

        let codex_recipe = dynamic_step(
            "codex",
            StepExecutor::CodexStructured,
            Some(SkillSource::Installed("plan".into())),
            Some(SkillKind::Plan),
        );
        assert_eq!(
            unmapped_codex_skill(&codex_recipe, AgentProvider::Codex),
            None
        );

        let codex_prompt = dynamic_step(
            "codex",
            StepExecutor::CodexStructured,
            Some(SkillSource::Prompt("brief".into())),
            Some(SkillKind::Custom),
        );
        assert_eq!(
            unmapped_codex_skill(&codex_prompt, AgentProvider::Codex),
            None
        );

        let claude_custom = dynamic_step(
            "claude",
            StepExecutor::InteractivePty,
            Some(SkillSource::Installed("ticket".into())),
            Some(SkillKind::Custom),
        );
        assert_eq!(
            unmapped_codex_skill(&claude_custom, AgentProvider::Claude),
            None
        );
    }

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
            profile_id: None,
            profile_snapshot: None,
            reuse_worktree: None,
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
                superkick_storage::SqliteSkillDefinitionRepo,
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
                superkick_storage::SqliteSkillDefinitionRepo,
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
                superkick_storage::SqliteSkillDefinitionRepo,
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
                superkick_storage::SqliteSkillDefinitionRepo,
            >::build_base_prompt(&t, kind, None, None);
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
            superkick_storage::SqliteSkillDefinitionRepo,
        >::build_base_prompt(
            &t, LaunchStepKind::Implement, None, Some("PLAN_OUTPUT")
        );
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
            superkick_storage::SqliteSkillDefinitionRepo,
        >::build_base_prompt(&t, LaunchStepKind::Implement, None, Some(""));
        assert!(!p.contains("--- Previous step summary ---"));
    }

    #[test]
    fn build_base_prompt_inlines_the_skill_body_over_the_hardcoded_text() {
        let t = task("SUP-42");
        let custom_body = "INLINE SKILL BODY: do the bespoke thing";
        let p = RealStepRunner::<
            superkick_storage::SqliteRunRepo,
            superkick_storage::SqliteRunStepRepo,
            superkick_storage::SqliteRunEventRepo,
            superkick_storage::SqliteAgentSessionRepo,
            superkick_storage::SqliteTranscriptRepo,
            superkick_storage::SqliteLaunchTaskRepo,
            superkick_storage::SqliteLaunchTaskInterventionRepo,
            superkick_storage::SqliteSkillDefinitionRepo,
        >::build_base_prompt(&t, LaunchStepKind::Implement, Some(custom_body), None);
        assert!(p.contains(custom_body), "skill body must be inlined");
        // The hardcoded per-kind wording is replaced, not appended.
        let hardcoded = step_body_for(PromptStepKind::Implement);
        assert!(
            !p.contains("Implement the changes needed to resolve this issue"),
            "hardcoded body text must not appear when a skill body is supplied"
        );
        assert_ne!(p, hardcoded);
        // Guardrail + completion contract still ride along on the body path.
        assert_prompt_contains_guardrail(&p);
        assert!(p.contains(superkick_core::STEP_RESULT_BEGIN));
    }

    #[test]
    fn build_base_prompt_falls_back_to_step_body_for_legacy_steps() {
        let t = task("SUP-43");
        for (kind, marker) in [
            (LaunchStepKind::Plan, "only plan"),
            (LaunchStepKind::Implement, "Only write code"),
            (LaunchStepKind::Review, "Only review code"),
        ] {
            let p = RealStepRunner::<
                superkick_storage::SqliteRunRepo,
                superkick_storage::SqliteRunStepRepo,
                superkick_storage::SqliteRunEventRepo,
                superkick_storage::SqliteAgentSessionRepo,
                superkick_storage::SqliteTranscriptRepo,
                superkick_storage::SqliteLaunchTaskRepo,
                superkick_storage::SqliteLaunchTaskInterventionRepo,
                superkick_storage::SqliteSkillDefinitionRepo,
            >::build_base_prompt(&t, kind, None, None);
            assert!(
                p.contains(marker),
                "{kind:?} legacy step must use the hardcoded step_body_for wording"
            );
        }
    }

    #[test]
    fn build_base_prompt_blank_skill_body_uses_hardcoded_fallback() {
        let t = task("SUP-44");
        let p = RealStepRunner::<
            superkick_storage::SqliteRunRepo,
            superkick_storage::SqliteRunStepRepo,
            superkick_storage::SqliteRunEventRepo,
            superkick_storage::SqliteAgentSessionRepo,
            superkick_storage::SqliteTranscriptRepo,
            superkick_storage::SqliteLaunchTaskRepo,
            superkick_storage::SqliteLaunchTaskInterventionRepo,
            superkick_storage::SqliteSkillDefinitionRepo,
        >::build_base_prompt(&t, LaunchStepKind::Review, Some("   \n  "), None);
        assert!(
            p.contains("Only review code"),
            "a whitespace-only skill body must fall back to step_body_for"
        );
    }

    #[test]
    fn lean_interactive_prompt_is_slash_directive_plus_contract_without_verbose_body() {
        let t = task("SUP-77");
        let p = RealStepRunner::<
            superkick_storage::SqliteRunRepo,
            superkick_storage::SqliteRunStepRepo,
            superkick_storage::SqliteRunEventRepo,
            superkick_storage::SqliteAgentSessionRepo,
            superkick_storage::SqliteTranscriptRepo,
            superkick_storage::SqliteLaunchTaskRepo,
            superkick_storage::SqliteLaunchTaskInterventionRepo,
            superkick_storage::SqliteSkillDefinitionRepo,
        >::lean_interactive_prompt(&t, "ticket");
        // Leads with the backend marker so `apply_claude_backend` won't prepend
        // a second `/ticket` directive; the slash directive follows on its own line.
        assert!(p.starts_with(BACKEND_DIRECTIVE_MARKER));
        assert!(p.contains("/ticket SUP-77"));
        assert!(p.contains("SUP-77"));
        assert!(p.contains(superkick_core::STEP_RESULT_BEGIN));
        assert!(p.contains(superkick_core::STEP_RESULT_END));
        // The verbose per-kind body is dropped on the lean path.
        assert!(!p.contains("Plan → Implement → Review"));
        assert!(!p.contains("--- Previous step summary ---"));
    }

    #[test]
    fn lean_prompt_through_claude_skill_backend_emits_one_directive() {
        let step = dynamic_step(
            "claude",
            StepExecutor::InteractivePty,
            Some(SkillSource::Installed("ticket".into())),
            Some(SkillKind::Custom),
        );
        let resolved =
            resolve_dynamic_agent(&step, StepExecutor::InteractivePty).expect("resolves");
        assert_eq!(
            resolved.backend,
            Some(AgentBackend::ClaudeSkill {
                skills: vec!["ticket".into()],
            }),
            "guards the double-invocation premise: the step carries a ClaudeSkill backend"
        );

        let t = task("SUP-77");
        let lean = RealStepRunner::<
            superkick_storage::SqliteRunRepo,
            superkick_storage::SqliteRunStepRepo,
            superkick_storage::SqliteRunEventRepo,
            superkick_storage::SqliteAgentSessionRepo,
            superkick_storage::SqliteTranscriptRepo,
            superkick_storage::SqliteLaunchTaskRepo,
            superkick_storage::SqliteLaunchTaskInterventionRepo,
            superkick_storage::SqliteSkillDefinitionRepo,
        >::lean_interactive_prompt(&t, "ticket");

        let (_, final_prompt) = crate::agent_spawn::apply_claude_backend(&resolved, lean);
        // Count actual invocations (a line that *starts* with the directive),
        // not the backtick-wrapped `/ticket` mention in the prose pointer.
        let directives = final_prompt
            .lines()
            .filter(|l| l.starts_with("/ticket"))
            .count();
        assert_eq!(
            directives, 1,
            "the backend must not double-invoke the skill the lean prompt already calls:\n{final_prompt}"
        );
    }

    #[test]
    fn step_skill_id_only_resolves_installed_skills() {
        let installed = dynamic_step(
            "claude",
            StepExecutor::InteractivePty,
            Some(SkillSource::Installed("ticket".into())),
            Some(SkillKind::Custom),
        );
        assert_eq!(step_skill_id(&installed), Some("ticket"));
        let prompt = dynamic_step(
            "claude",
            StepExecutor::InteractivePty,
            Some(SkillSource::Prompt("brief".into())),
            Some(SkillKind::Custom),
        );
        assert_eq!(step_skill_id(&prompt), None);
        let none = dynamic_step("claude", StepExecutor::InteractivePty, None, None);
        assert_eq!(step_skill_id(&none), None);
    }

    #[test]
    fn skill_artifact_path_routes_by_artifact_kind() {
        let work = std::path::Path::new("/wt");
        let mut skill = SkillDefinition::builtins().remove(0);
        skill.id = "ticket".into();
        skill.artifact_kind = SkillArtifact::Skill;
        assert_eq!(
            skill_artifact_path(work, &skill),
            Some(std::path::PathBuf::from(
                "/wt/.claude/skills/ticket/SKILL.md"
            ))
        );
        skill.artifact_kind = SkillArtifact::Command;
        assert_eq!(
            skill_artifact_path(work, &skill),
            Some(std::path::PathBuf::from("/wt/.claude/commands/ticket.md"))
        );
    }

    #[test]
    fn skill_artifact_path_rejects_unsafe_ids() {
        let work = std::path::Path::new("/wt");
        let mut skill = SkillDefinition::builtins().remove(0);
        skill.artifact_kind = SkillArtifact::Skill;
        for bad in ["../escape", "a/b", ".hidden", "..", "with\\sep", ""] {
            skill.id = bad.into();
            assert_eq!(
                skill_artifact_path(work, &skill),
                None,
                "unsafe id {bad:?} must not build a path"
            );
        }
    }

    #[test]
    fn is_safe_skill_slug_accepts_plain_ids_and_rejects_traversal() {
        assert!(is_safe_skill_slug("ticket"));
        assert!(is_safe_skill_slug("full-session_2"));
        assert!(!is_safe_skill_slug(""));
        assert!(!is_safe_skill_slug(".hidden"));
        assert!(!is_safe_skill_slug("a/b"));
        assert!(!is_safe_skill_slug("a\\b"));
        assert!(!is_safe_skill_slug(".."));
        assert!(!is_safe_skill_slug("x..y"));
    }

    #[tokio::test]
    async fn write_skill_file_does_not_clobber_a_preexisting_file() {
        let dir = tempfile::TempDir::new().expect("tempdir");
        let path = dir.path().join(".claude/skills/ticket/SKILL.md");
        tokio::fs::create_dir_all(path.parent().expect("parent"))
            .await
            .expect("mkdir");
        tokio::fs::write(&path, "REPO NATIVE")
            .await
            .expect("seed repo-native file");

        let wrote = write_skill_file(&path, "MANAGED BODY")
            .await
            .expect("write");
        assert!(!wrote, "must not overwrite a pre-existing file");
        let on_disk = tokio::fs::read_to_string(&path).await.expect("read");
        assert_eq!(on_disk, "REPO NATIVE", "repo-native body must survive");
    }

    #[tokio::test]
    async fn write_skill_file_creates_missing_file() {
        let dir = tempfile::TempDir::new().expect("tempdir");
        let path = dir.path().join(".claude/skills/ticket/SKILL.md");
        let wrote = write_skill_file(&path, "MANAGED BODY")
            .await
            .expect("write");
        assert!(wrote, "absent file must be created");
        let on_disk = tokio::fs::read_to_string(&path).await.expect("read");
        assert_eq!(on_disk, "MANAGED BODY");
    }

    #[test]
    fn lean_skill_id_requires_materialised_body() {
        let step = dynamic_step(
            "claude",
            StepExecutor::InteractivePty,
            Some(SkillSource::Installed("ticket".into())),
            Some(SkillKind::Custom),
        );

        // body=None equivalent: nothing materialised → non-lean (fall back to
        // the full self-contained prompt so `/ticket` is not a no-op).
        let none: HashSet<String> = HashSet::new();
        assert_eq!(lean_skill_id(&step, &none), None);

        // body=Some equivalent: id present on disk → lean `/name`.
        let materialised: HashSet<String> = HashSet::from(["ticket".to_string()]);
        assert_eq!(lean_skill_id(&step, &materialised), Some("ticket"));
    }

    #[test]
    fn lean_skill_id_is_none_for_non_interactive_executor() {
        let step = dynamic_step(
            "claude",
            StepExecutor::CodexStructured,
            Some(SkillSource::Installed("ticket".into())),
            Some(SkillKind::Custom),
        );
        let materialised: HashSet<String> = HashSet::from(["ticket".to_string()]);
        assert_eq!(lean_skill_id(&step, &materialised), None);
    }

    #[test]
    fn truncate_tail_chars_returns_input_under_cap() {
        assert_eq!(crate::text::tail_chars("hi", 10), "hi");
    }

    #[test]
    fn truncate_tail_chars_returns_input_at_cap() {
        assert_eq!(crate::text::tail_chars("hello", 5), "hello");
    }

    #[test]
    fn truncate_tail_chars_keeps_tail_when_over_cap() {
        assert_eq!(crate::text::tail_chars("abcdef", 3), "def");
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
            superkick_storage::SqliteSkillDefinitionRepo,
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
            superkick_storage::SqliteSkillDefinitionRepo,
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
        assert_eq!(crate::text::tail_chars(s, 2), "🚀🐙");
    }
}
