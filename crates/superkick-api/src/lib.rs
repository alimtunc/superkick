use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::Mutex;

use axum::Router;
use axum::routing::{get, patch, post};

use superkick_config::{IssueTrigger, LaunchProfileConfig, OrchestrationConfig};
use superkick_core::AgentCatalog;
use superkick_integrations::linear::LinearClient;
use superkick_runtime::launch_task::{RealStepRunner, RealStepRunnerDeps};
use superkick_runtime::{
    AgentCatalogProvider, AgentService, AttentionService, ConversationAdapters, ConversationRunner,
    InterruptService, IssuePullRequestService, LaunchProfileService, LaunchTaskCanceller,
    LaunchTaskEventBus, LaunchTaskExecutor, LaunchTaskRegistry, OwnershipService,
    PtySessionRegistry, PublishingRunEventRepo, PullRequestService, QueueTriageService, RepoCache,
    RunService, RuntimeDetector, SessionBus, StepEngine, StepEngineDeps, TerminalTakeoverService,
    TurnEventBus, WorkspaceEventBus, boot_refresh as runtime_boot_refresh,
    spawn_heartbeat_listener,
};
use superkick_storage::{
    SqliteAgentDefinitionRepo, SqliteAgentSessionRepo, SqliteArtifactRepo,
    SqliteAttentionRequestRepo, SqliteConversationRepo, SqliteDiffReviewRepo, SqliteInterruptRepo,
    SqliteIssueBlockerRepo, SqliteIssueCleanRepo, SqliteIssuePullRequestRepo,
    SqliteIssueWorkspaceContextRepo, SqliteLaunchProfileRepo, SqliteLaunchTaskInterventionRepo,
    SqliteLaunchTaskRepo, SqliteMemoryEntryRepo, SqliteOrchestratorSessionRepo,
    SqliteProviderSettingsRepo, SqlitePullRequestRepo, SqliteRecoveryEventRepo,
    SqliteRunContextSnapshotRepo, SqliteRunEventRepo, SqliteRunRepo, SqliteRunStepRepo,
    SqliteRuntimeRepo, SqliteSessionOwnershipRepo, SqliteSkillDefinitionRepo, SqliteTranscriptRepo,
    SqliteTurnEventRepo, SqliteTurnRepo,
};

mod error;
mod handlers;
mod run_seams;
mod search_state;
#[cfg(feature = "test-support")]
mod test_routers;
#[cfg(feature = "embedded-ui")]
mod ui_assets;

#[cfg(feature = "test-support")]
pub use test_routers::{
    agents_test_router, issue_context_test_router, launch_profile_config_test_router,
    launch_task_test_router, linear_writes_test_router, model_catalog_test_router,
    orchestrator_session_test_router, reusable_worktree_test_router,
    run_context_snapshot_test_router, run_diff_test_router, run_review_test_router,
    runner_config_test_router, test_handlers, tests_only,
};

// ── App state ──────────────────────────────────────────────────────────

/// Every run-event writer in the process goes through this wrapper so the
/// workspace-level `WorkspaceEventBus` (SUP-84) sees every persisted event
/// without service-level changes.
type EventRepo = PublishingRunEventRepo<SqliteRunEventRepo>;

pub(crate) type Engine = StepEngine<
    SqliteRunRepo,
    SqliteRunStepRepo,
    EventRepo,
    SqliteAgentSessionRepo,
    SqliteArtifactRepo,
    SqliteInterruptRepo,
    SqliteAttentionRequestRepo,
    SqliteTranscriptRepo,
>;

type IntService = InterruptService<SqliteRunRepo, EventRepo, SqliteInterruptRepo>;

type AttnService = AttentionService<SqliteAttentionRequestRepo, EventRepo, SqliteRunRepo>;

type OwnService = OwnershipService<SqliteSessionOwnershipRepo, EventRepo>;

type ChatRunner =
    ConversationRunner<SqliteConversationRepo, SqliteTurnRepo, SqliteTurnEventRepo, SqliteRunRepo>;

type TakeoverService = TerminalTakeoverService<EventRepo>;

type PrService = PullRequestService<SqlitePullRequestRepo, SqliteArtifactRepo, SqliteRunRepo>;

type IssuePrService = IssuePullRequestService<SqliteIssuePullRequestRepo>;

type TriageService = QueueTriageService<
    SqliteRunRepo,
    SqliteAttentionRequestRepo,
    SqliteInterruptRepo,
    SqliteSessionOwnershipRepo,
    EventRepo,
    SqlitePullRequestRepo,
    SqliteArtifactRepo,
>;

type ProdRunService = RunService<SqliteRunRepo, SqliteLaunchTaskRepo, EventRepo>;

/// Concrete launch-profile composition service held in `AppState`.
pub(crate) type ProdLaunchProfileService =
    LaunchProfileService<SqliteLaunchProfileRepo, SqliteSkillDefinitionRepo, SqliteLaunchTaskRepo>;

#[derive(Clone)]
pub(crate) struct AppState {
    pub run_repo: Arc<SqliteRunRepo>,
    pub review_repo: Arc<SqliteDiffReviewRepo>,
    pub step_repo: Arc<SqliteRunStepRepo>,
    pub event_repo: Arc<EventRepo>,
    pub session_repo: Arc<SqliteAgentSessionRepo>,
    pub interrupt_repo: Arc<SqliteInterruptRepo>,
    pub attention_repo: Arc<SqliteAttentionRequestRepo>,
    pub transcript_repo: Arc<SqliteTranscriptRepo>,
    pub issue_blocker_repo: Arc<SqliteIssueBlockerRepo>,
    /// SUP-102 — orchestrator session + checkpoint store. Independent of the
    /// run pipeline; lives next to it as a parallel aggregate.
    pub orchestrator_session_repo: Arc<SqliteOrchestratorSessionRepo>,
    /// SUP-116 — launch task aggregate (parent + ordered steps). Read-and-
    /// create from the API today; the execution loop in SUP-118 will mutate
    /// step state through this same repo.
    pub launch_task_repo: Arc<SqliteLaunchTaskRepo>,
    /// Stats-safe archive + destructive purge of an issue's runs/launch tasks.
    pub issue_clean_repo: Arc<SqliteIssueCleanRepo>,
    /// App-managed runtime config: provider settings, editable
    /// skills, and launch profiles. Seeded with builtins at boot; the handlers
    /// read/write them directly, the composer resolves launches via the service.
    pub provider_settings_repo: Arc<SqliteProviderSettingsRepo>,
    pub skill_repo: Arc<SqliteSkillDefinitionRepo>,
    /// App-managed agent CRUD. A successful write rebuilds `agent_catalog` so
    /// launches see the edit; read and write handlers both route through it.
    pub agent_service: Arc<AgentService<SqliteAgentDefinitionRepo>>,
    pub launch_profile_repo: Arc<SqliteLaunchProfileRepo>,
    pub launch_profile_service: Arc<ProdLaunchProfileService>,
    /// SUP-148 — append-only ledger entries scoped to an
    /// `IssueWorkspaceContext`. Reads and writes from the issue-context
    /// handlers; Launch Tasks and chat surfaces will append through this
    /// repo as those flows come online.
    pub memory_repo: Arc<SqliteMemoryEntryRepo>,
    /// SUP-147 / SUP-148 — workspace context aggregate. Production wires
    /// both the read and write paths to the same SQLite repo.
    pub issue_workspace_context_repo: Arc<SqliteIssueWorkspaceContextRepo>,
    /// SUP-154 — operator-facing free-text interventions queued onto a
    /// running Launch Task. Sibling of `launch_task_repo`; the runtime
    /// reads it at every step start.
    pub launch_task_intervention_repo: Arc<SqliteLaunchTaskInterventionRepo>,
    /// SUP-187 — persisted (regenerable) `RunContextSnapshot` projection store.
    /// The snapshot handler derives a fresh redacted projection and upserts it
    /// here; it is a cache/audit copy, never a source of truth.
    pub run_context_snapshot_repo: Arc<SqliteRunContextSnapshotRepo>,
    /// SUP-118 — process-scope broadcast bus for launch-task transitions.
    /// SSE consumers subscribe through `/launch-tasks/events`.
    pub launch_task_event_bus: Arc<LaunchTaskEventBus>,
    /// SUP-118 — production launch-task executor (V1 stub step runner).
    /// Owns the in-flight cancellation registry internally.
    pub launch_task_executor: Arc<handlers::launch_tasks::ProdLaunchTaskExecutor>,
    /// DB-backed, rebuildable agent catalog. Seeded from
    /// `AgentDefinition::builtins()` + merged `superkick.yaml` agents at boot,
    /// then rebuilt from `agent_repo` after each agent write so the read API,
    /// the composer, and the step runners share one live source of truth.
    pub agent_catalog: AgentCatalogProvider,
    pub runtime_detector: Arc<RuntimeDetector>,
    /// Serialises `reconcile_blockers` so two concurrent `GET /launch-queue`
    /// calls cannot both publish the same `DependencyResolved` transition
    /// (SUP-81). Held only around the diff+persist+emit window.
    pub blocker_reconcile_lock: Arc<Mutex<()>>,
    pub interrupt_service: Arc<IntService>,
    pub attention_service: Arc<AttnService>,
    pub ownership_service: Arc<OwnService>,
    pub pr_service: Arc<PrService>,
    pub issue_pr_service: Arc<IssuePrService>,
    pub queue_triage_service: Arc<TriageService>,
    pub run_service: Arc<ProdRunService>,
    pub pty_registry: Arc<PtySessionRegistry>,
    pub workspace_bus: Arc<WorkspaceEventBus>,
    pub conversation_repo: Arc<SqliteConversationRepo>,
    pub turn_repo: Arc<SqliteTurnRepo>,
    pub turn_event_repo: Arc<SqliteTurnEventRepo>,
    pub conversation_runner: Arc<ChatRunner>,
    pub terminal_takeover_service: Arc<TakeoverService>,
    pub linear_client: Option<Arc<LinearClient>>,
    /// SUP-158 — last-90d Linear comment snapshot, refreshed every 5 min from
    /// a background task. Search handler filters by substring per request.
    pub comment_cache: search_state::CommentCache,
    /// SUP-158 — repo file path index, walked once at boot. Refresh via
    /// `POST /search/files/refresh`.
    pub file_index: search_state::FileIndex,
    pub repo_slug: String,
    pub base_branch: String,
    pub config_path: String,
    /// Boot-time `runner` snapshot — compared against the on-disk value so
    /// `GET /config/runner` can report `requires_restart`.
    pub boot_runner: superkick_config::RunnerConfig,
    pub launch_profile: LaunchProfileConfig,
    pub orchestration: OrchestrationConfig,
    pub issue_trigger: IssueTrigger,
    /// Boot snapshot of `skills.import_dirs` — the directories the repo-import
    /// scanner walks for `GET /skills/importable`. Read-only after boot.
    pub skill_import_dirs: Vec<PathBuf>,
    /// Run-level budget snapshot applied to every new run at launch time.
    /// Computed once from `BudgetConfig` on boot; mid-flight config changes do
    /// not retroactively affect in-flight runs.
    pub run_budget: superkick_core::RunBudget,
}

pub(crate) const LINEAR_NOT_CONFIGURED: &str = "LINEAR_API_KEY not configured";

impl AppState {
    /// Linear client guard shared by every handler that requires the
    /// integration: 503 with a stable message when the key is absent.
    pub(crate) fn linear(&self) -> Result<&Arc<LinearClient>, error::AppError> {
        self.linear_client
            .as_ref()
            .ok_or(error::AppError::ServiceUnavailable(LINEAR_NOT_CONFIGURED))
    }
}

// ── Server config ─────────────────────────────────────────────────────

pub struct ServerConfig {
    pub config_path: String,
    pub database_url: String,
    pub cache_dir: String,
    /// Pre-bound TCP listener. Avoids TOCTOU races on port availability.
    pub listener: tokio::net::TcpListener,
    /// When true and the `embedded-ui` feature is enabled, serve the embedded
    /// dashboard as a SPA fallback alongside the API. Ignored when the feature
    /// is off.
    pub serve_ui: bool,
}

// ── Public entry point ────────────────────────────────────────────────

pub async fn run_server(cfg: ServerConfig) -> anyhow::Result<()> {
    let config_path = std::path::Path::new(&cfg.config_path);
    if !config_path.exists() {
        tracing::info!(
            path = %cfg.config_path,
            "no superkick.yaml found — booting from product defaults"
        );
    }
    let config = superkick_config::load_or_bootstrap(config_path)?;

    let state = build_app_state(&cfg, config).await?;
    let app = Router::new().nest("/api", api_router(state));
    let app = attach_ui(app, cfg.serve_ui);

    let local_addr = cfg.listener.local_addr()?;
    tracing::info!(
        "Superkick server running on http://127.0.0.1:{}",
        local_addr.port()
    );
    tracing::info!("Press Ctrl+C to stop.");

    axum::serve(cfg.listener, app).await?;

    Ok(())
}

/// Construct every repo, service, and background task the server needs, then
/// assemble the shared `AppState`. Pure wiring — no routing concerns.
async fn build_app_state(
    cfg: &ServerConfig,
    config: superkick_config::SuperkickConfig,
) -> anyhow::Result<AppState> {
    let base_branch = config.runner.base_branch.clone();
    let boot_runner = config.runner.clone();
    let launch_profile = config.launch_profile.clone();
    let orchestration = config.orchestration.clone();
    let issue_trigger = config.issue_source.trigger;
    let mut skill_import_dirs = config.skills.effective_import_dirs();
    // Also scan the target repo's own `.claude` so its project skills import
    // without extra config.
    skill_import_dirs.push(std::path::PathBuf::from(&config.runner.repo_root).join(".claude"));
    let run_budget = config.budget.run_budget_snapshot();
    let recovery_config = config.recovery.to_recovery_config();
    let repo_slug = superkick_config::detect_repo_slug().unwrap_or_else(|| {
        tracing::warn!("could not detect repo_slug from git remote — /config will return empty");
        String::new()
    });

    let pool = superkick_storage::connect(&cfg.database_url).await?;

    let workspace_bus = WorkspaceEventBus::new();
    let session_bus = SessionBus::new();
    spawn_session_lifecycle_forwarder(Arc::clone(&session_bus), Arc::clone(&workspace_bus));
    // SUP-73 — heartbeat listener and recovery scheduler are wired below
    // once the run repo and recovery repo are constructed. Both are detached
    // tasks that live for the lifetime of the server.

    let run_repo = Arc::new(SqliteRunRepo::new(pool.clone()));
    let review_repo = Arc::new(SqliteDiffReviewRepo::new(pool.clone()));
    let step_repo = Arc::new(SqliteRunStepRepo::new(pool.clone()));
    let event_repo = Arc::new(PublishingRunEventRepo::new(
        SqliteRunEventRepo::new(pool.clone()),
        Arc::clone(&workspace_bus),
    ));
    let session_repo = Arc::new(SqliteAgentSessionRepo::new(pool.clone()));
    let artifact_repo = Arc::new(SqliteArtifactRepo::new(pool.clone()));
    let pr_repo = Arc::new(SqlitePullRequestRepo::new(pool.clone()));
    let issue_pr_repo = Arc::new(SqliteIssuePullRequestRepo::new(pool.clone()));
    let interrupt_repo = Arc::new(SqliteInterruptRepo::new(pool.clone()));
    let attention_repo = Arc::new(SqliteAttentionRequestRepo::new(pool.clone()));
    let ownership_repo = Arc::new(SqliteSessionOwnershipRepo::new(pool.clone()));
    let issue_blocker_repo = Arc::new(SqliteIssueBlockerRepo::new(pool.clone()));
    let recovery_event_repo = Arc::new(SqliteRecoveryEventRepo::new(pool.clone()));
    let orchestrator_session_repo = Arc::new(SqliteOrchestratorSessionRepo::new(pool.clone()));
    let launch_task_repo = Arc::new(SqliteLaunchTaskRepo::new(pool.clone()));
    let issue_clean_repo = Arc::new(SqliteIssueCleanRepo::new(pool.clone()));
    let provider_settings_repo = Arc::new(SqliteProviderSettingsRepo::new(pool.clone()));
    let skill_repo = Arc::new(SqliteSkillDefinitionRepo::new(pool.clone()));
    let agent_repo = Arc::new(SqliteAgentDefinitionRepo::new(pool.clone()));
    let launch_profile_repo = Arc::new(SqliteLaunchProfileRepo::new(pool.clone()));
    let launch_profile_service = Arc::new(LaunchProfileService::new(
        SqliteLaunchProfileRepo::new(pool.clone()),
        SqliteSkillDefinitionRepo::new(pool.clone()),
        SqliteLaunchTaskRepo::new(pool.clone()),
    ));
    let memory_repo = Arc::new(SqliteMemoryEntryRepo::new(pool.clone()));
    let issue_workspace_context_repo = Arc::new(SqliteIssueWorkspaceContextRepo::new(pool.clone()));
    let launch_task_intervention_repo =
        Arc::new(SqliteLaunchTaskInterventionRepo::new(pool.clone()));
    let run_context_snapshot_repo = Arc::new(SqliteRunContextSnapshotRepo::new(pool.clone()));
    let launch_task_event_bus = LaunchTaskEventBus::new();
    // Builtins are seeded by `seed_defaults`; merge any `superkick.yaml`
    // `agents:` entries (resolved by `config.agent_catalog()`) into the DB as
    // Custom rows so a YAML-configured catalog still boots, then build the
    // live, rebuildable catalog from the DB store.
    {
        use superkick_storage::repo::AgentDefinitionRepo as _;
        for def in config.agent_catalog().definitions() {
            agent_repo.insert_if_absent(def).await?;
        }
    }
    let agent_catalog = {
        use superkick_storage::repo::AgentDefinitionRepo as _;
        AgentCatalogProvider::new(AgentCatalog::from_definitions(agent_repo.list().await?))
    };
    let agent_service = Arc::new(AgentService::new(
        Arc::clone(&agent_repo),
        agent_catalog.clone(),
    ));
    let runtime_repo = Arc::new(SqliteRuntimeRepo::new(pool.clone()));
    let runtime_detector = Arc::new(RuntimeDetector::new(Arc::clone(&runtime_repo)));

    let transcript_repo = Arc::new(SqliteTranscriptRepo::new(pool.clone()));
    let conversation_repo = Arc::new(SqliteConversationRepo::new(pool.clone()));
    let turn_repo = Arc::new(SqliteTurnRepo::new(pool.clone()));
    let turn_event_repo = Arc::new(SqliteTurnEventRepo::new(pool));
    let pty_registry = Arc::new(PtySessionRegistry::new());

    let cache_root = PathBuf::from(&cfg.cache_dir);
    let repo_cache = RepoCache::new(cache_root).await?;

    let linear_client = std::env::var(superkick_config::ENV_LINEAR_API_KEY)
        .ok()
        .filter(|k| !k.is_empty())
        .map(|key| Arc::new(LinearClient::new(key)));

    if linear_client.is_none() {
        tracing::warn!(
            "LINEAR_API_KEY not set — /issues endpoint will return 503 and child agent \
             roles configured for linear_context will downgrade to `none`"
        );
    }

    let comment_cache = search_state::CommentCache::new();
    if let Some(client) = &linear_client {
        search_state::spawn_comment_refresh(Arc::clone(client), comment_cache.clone());
    }

    let file_index_root = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let file_index = search_state::FileIndex::new(file_index_root, repo_slug.clone());
    search_state::spawn_file_index_boot(file_index.clone());

    let real_step_runner = Arc::new(RealStepRunner::new(RealStepRunnerDeps {
        run_repo: Arc::clone(&run_repo),
        step_repo: Arc::clone(&step_repo),
        event_repo: Arc::clone(&event_repo),
        session_repo: Arc::clone(&session_repo),
        transcript_repo: Arc::clone(&transcript_repo),
        launch_task_repo: Arc::clone(&launch_task_repo),
        issue_workspace_context_repo: Arc::clone(&issue_workspace_context_repo)
            as Arc<dyn superkick_storage::repo::IssueWorkspaceContextRepoDyn>,
        memory_repo: Arc::clone(&memory_repo)
            as Arc<dyn superkick_storage::repo::MemoryEntryRepoDyn>,
        intervention_repo: Arc::clone(&launch_task_intervention_repo),
        skill_repo: Arc::clone(&skill_repo),
        registry: Arc::clone(&pty_registry),
        session_bus: Some(Arc::clone(&session_bus)),
        launch_task_bus: Arc::clone(&launch_task_event_bus),
        repo_cache: repo_cache.clone(),
        config: config.clone(),
        agent_catalog: agent_catalog.clone(),
        linear_client: linear_client.clone(),
        repo_slug: repo_slug.clone(),
        base_branch: base_branch.clone(),
    }));
    let launch_task_executor = LaunchTaskExecutor::with_max_auto_resumes(
        Arc::clone(&launch_task_repo),
        Arc::clone(&launch_task_event_bus),
        Arc::new(LaunchTaskRegistry::new()),
        real_step_runner,
        config.budget.max_auto_resumes,
    );

    let engine = Arc::new(StepEngine::new(StepEngineDeps {
        run_repo: Arc::clone(&run_repo),
        step_repo: Arc::clone(&step_repo),
        event_repo: Arc::clone(&event_repo),
        session_repo: Arc::clone(&session_repo),
        artifact_repo: Arc::clone(&artifact_repo),
        interrupt_repo: Arc::clone(&interrupt_repo),
        attention_repo: Arc::clone(&attention_repo),
        transcript_repo: Arc::clone(&transcript_repo),
        registry: Arc::clone(&pty_registry),
        repo_cache,
        config,
        agent_catalog: agent_catalog.clone(),
        linear_client: linear_client.clone(),
        session_bus: Some(Arc::clone(&session_bus)),
    }));

    let interrupt_service = Arc::new(InterruptService::new(
        Arc::clone(&run_repo),
        Arc::clone(&event_repo),
        Arc::clone(&interrupt_repo),
    ));

    let attention_service = Arc::new(AttentionService::new(
        Arc::clone(&attention_repo),
        Arc::clone(&event_repo),
        Arc::clone(&run_repo),
    ));

    let ownership_service = Arc::new(OwnershipService::new(
        Arc::clone(&ownership_repo),
        Arc::clone(&event_repo),
        Arc::clone(&pty_registry),
    ));

    let pr_service = PullRequestService::new(
        Arc::clone(&pr_repo),
        Arc::clone(&artifact_repo),
        Arc::clone(&run_repo),
    );
    let issue_pr_service =
        IssuePullRequestService::new(Arc::clone(&issue_pr_repo), repo_slug.clone());

    let queue_triage_service = QueueTriageService::new(
        Arc::clone(&run_repo),
        Arc::clone(&attention_repo),
        Arc::clone(&interrupt_repo),
        Arc::clone(&pr_service),
        Arc::clone(&recovery_event_repo),
        Arc::clone(&ownership_service),
    );

    let run_spawner = run_seams::EngineRunSpawner::new(Arc::clone(&engine));
    let run_service = RunService::new(
        Arc::clone(&run_repo),
        Arc::clone(&launch_task_repo),
        Arc::clone(&event_repo),
        Arc::clone(&launch_task_executor) as Arc<dyn LaunchTaskCanceller>,
        run_spawner as Arc<dyn superkick_runtime::RunSpawn>,
    );

    let turn_event_bus = TurnEventBus::new();
    // Default workdir for issue-scoped conversations (no run worktree to
    // anchor to). The API server runs from the repo root today, so its CWD
    // is the right anchor; we capture it once at boot.
    let default_workdir = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let conversation_runner = Arc::new(ConversationRunner::new(
        Arc::clone(&conversation_repo),
        Arc::clone(&turn_repo),
        Arc::clone(&turn_event_repo),
        Arc::clone(&run_repo),
        turn_event_bus,
        ConversationAdapters::default(),
        default_workdir,
        linear_client.clone(),
    ));

    let terminal_takeover_service = Arc::new(TerminalTakeoverService::new(
        Arc::clone(&pty_registry),
        Arc::clone(&event_repo),
    ));

    // SUP-73 — start the heartbeat listener (stamps `runs.last_heartbeat_at`
    // from `SessionBus` events) and the recovery scheduler (periodic
    // Healthy↔Stalled classification).
    spawn_heartbeat_listener(Arc::clone(&session_bus), Arc::clone(&run_repo));
    superkick_runtime::spawn_recovery_scheduler(
        Arc::clone(&recovery_event_repo),
        Arc::clone(&workspace_bus),
        recovery_config,
    );

    // Reconcile orphaned Launch Task shadow runs before serving, so a dead run
    // (server restart / crashed executor) doesn't block relaunch or read "live".
    // Bounded: on timeout we serve anyway and the periodic sweep reconciles.
    const BOOT_RECONCILE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);
    match tokio::time::timeout(
        BOOT_RECONCILE_TIMEOUT,
        superkick_runtime::reconcile_launch_task_orphans(
            launch_task_executor.as_ref(),
            run_repo.as_ref(),
        ),
    )
    .await
    {
        Ok(Ok(report)) if report.reconciled > 0 => {
            tracing::info!(
                reconciled = report.reconciled,
                scanned = report.scanned,
                "boot reconciled orphaned launch-task shadow runs"
            );
        }
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
            tracing::warn!(error = %e, "boot launch-task liveness reconciliation failed")
        }
        Err(_elapsed) => tracing::warn!(
            "boot launch-task liveness reconciliation timed out after {BOOT_RECONCILE_TIMEOUT:?}; \
             serving anyway — the periodic sweep will reconcile"
        ),
    }
    superkick_runtime::spawn_launch_task_liveness_sweep(
        Arc::clone(&launch_task_executor),
        Arc::clone(&run_repo),
        superkick_runtime::DEFAULT_LIVENESS_SWEEP_INTERVAL,
    );

    // SUP-96 — populate the runtime registry once at boot in the background.
    // Best-effort: if a CLI hangs or detection fails for any reason, the
    // operator still gets a working API and can hit POST /runtimes/refresh
    // later. Spawned detached so a slow probe never blocks server startup.
    {
        let detector = Arc::clone(&runtime_detector);
        tokio::spawn(async move {
            runtime_boot_refresh(&detector).await;
        });
    }

    Ok(AppState {
        run_repo,
        review_repo,
        step_repo,
        event_repo,
        session_repo,
        interrupt_repo,
        attention_repo,
        transcript_repo,
        issue_blocker_repo,
        orchestrator_session_repo,
        launch_task_repo,
        issue_clean_repo,
        provider_settings_repo,
        skill_repo,
        agent_service,
        launch_profile_repo,
        launch_profile_service,
        memory_repo,
        issue_workspace_context_repo,
        launch_task_intervention_repo,
        run_context_snapshot_repo,
        launch_task_event_bus,
        launch_task_executor,
        agent_catalog,
        runtime_detector,
        blocker_reconcile_lock: Arc::new(Mutex::new(())),
        interrupt_service,
        attention_service,
        ownership_service,
        pr_service,
        issue_pr_service,
        queue_triage_service,
        run_service,
        pty_registry,
        workspace_bus,
        conversation_repo,
        turn_repo,
        turn_event_repo,
        conversation_runner,
        terminal_takeover_service,
        linear_client,
        comment_cache,
        file_index,
        repo_slug,
        base_branch,
        config_path: cfg.config_path.clone(),
        boot_runner,
        launch_profile,
        orchestration,
        issue_trigger,
        skill_import_dirs,
        run_budget,
    })
}

/// The full API route table. Pure routing — no wiring concerns.
fn api_router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(handlers::health::health))
        .route("/config", get(handlers::health::get_config))
        .route(
            "/config/runner",
            get(handlers::config::get_runner_config).put(handlers::config::put_runner_config),
        )
        .route(
            "/config/launch-profile",
            patch(handlers::config::patch_launch_profile),
        )
        .route("/dashboard/queue", get(handlers::dashboard::get_queue))
        .route("/launch-queue", get(handlers::launch_queue::get_queue))
        .route(
            "/launch-queue/{issue_identifier}/dispatch",
            post(handlers::launch_queue::dispatch_from_queue),
        )
        .route("/events", get(handlers::events::workspace_events))
        .route("/me", get(handlers::me::get_me))
        .route(
            "/issues",
            get(handlers::issues::list_issues).post(handlers::issues::create_issue),
        )
        .route(
            "/issues/{id}",
            get(handlers::issues::get_issue).patch(handlers::issues::patch_issue),
        )
        .route(
            "/issues/{id}/pull-request-diff",
            get(handlers::issues::get_issue_pull_request_diff),
        )
        .route(
            "/issues/{id}/comments",
            post(handlers::issues::create_comment),
        )
        .route("/issues/{id}/clean", post(handlers::issues::clean_issue))
        .route(
            "/issues/{id}/reusable-worktree",
            get(handlers::issues::get_reusable_worktree),
        )
        .route(
            "/linear/options",
            get(handlers::linear_options::get_options),
        )
        .route("/search", get(handlers::search::search))
        .route(
            "/search/files/refresh",
            post(handlers::search::refresh_files),
        )
        .route(
            "/issues/{id}/context",
            get(handlers::issue_context::get_or_create_context),
        )
        .route(
            "/issues/{id}/context/memory",
            get(handlers::issue_context::list_memory).post(handlers::issue_context::append_memory),
        )
        .route(
            "/runs",
            post(handlers::runs::create_run).get(handlers::runs::list_runs),
        )
        .route("/runs/{id}", get(handlers::runs::get_run))
        .route("/runs/{id}/diff", get(handlers::runs::get_run_diff))
        .route(
            "/runs/{id}/review",
            get(handlers::run_reviews::get_run_review),
        )
        .route(
            "/runs/{id}/review/threads",
            post(handlers::run_reviews::create_thread),
        )
        .route(
            "/runs/{id}/review/threads/{thread_id}",
            patch(handlers::run_reviews::patch_thread).delete(handlers::run_reviews::delete_thread),
        )
        .route(
            "/runs/{id}/review/threads/{thread_id}/comments",
            post(handlers::run_reviews::add_comment),
        )
        .route(
            "/runs/{id}/review/threads/{thread_id}/comments/{comment_id}",
            patch(handlers::run_reviews::patch_comment)
                .delete(handlers::run_reviews::delete_comment),
        )
        .route(
            "/runs/{id}/review/files/reviewed",
            post(handlers::run_reviews::set_file_reviewed),
        )
        .route(
            "/runs/{id}/review/fix-with-ai",
            post(handlers::run_reviews::fix_with_ai),
        )
        .route("/runs/{id}/ship", post(handlers::runs::ship_run))
        .route("/runs/{id}/events", get(handlers::runs::get_run_events))
        .route(
            "/runs/{id}/events/log",
            get(handlers::runs::list_run_events),
        )
        .route("/runs/{id}/cancel", post(handlers::runs::cancel_run))
        .route(
            "/runs/{id}/interrupts",
            get(handlers::interrupts::list_interrupts),
        )
        .route(
            "/runs/{run_id}/interrupts/{interrupt_id}/answer",
            post(handlers::interrupts::answer_interrupt),
        )
        .route(
            "/runs/{id}/attention-requests",
            get(handlers::attention::list_attention_requests)
                .post(handlers::attention::create_attention_request),
        )
        .route(
            "/runs/{run_id}/attention-requests/{request_id}/reply",
            post(handlers::attention::reply_attention_request),
        )
        .route(
            "/runs/{run_id}/attention-requests/{request_id}/cancel",
            post(handlers::attention::cancel_attention_request),
        )
        .route(
            "/runs/{id}/terminal",
            get(handlers::terminal::attach_terminal),
        )
        .route(
            "/runs/{id}/terminal/{takeover_id}",
            get(handlers::terminal::attach_takeover_terminal),
        )
        .route(
            "/runs/{id}/terminal-history",
            get(handlers::terminal::get_terminal_history),
        )
        .route(
            "/runs/{id}/terminal-takeover/modes",
            get(handlers::terminal_takeover::list_modes),
        )
        .route(
            "/runs/{id}/terminal-takeover/open",
            post(handlers::terminal_takeover::open_takeover),
        )
        .route(
            "/runs/{id}/terminal-takeover/{takeover_id}/close",
            post(handlers::terminal_takeover::close_takeover),
        )
        .route(
            "/runs/{id}/takeovers",
            get(handlers::terminal_takeover::list_active),
        )
        .route(
            "/runs/{run_id}/sessions/{session_id}/attach",
            post(handlers::sessions::prepare_attach),
        )
        .route(
            "/runs/{run_id}/sessions/{session_id}/ownership",
            get(handlers::ownership::get_ownership),
        )
        .route(
            "/runs/{run_id}/sessions/{session_id}/ownership/takeover",
            post(handlers::ownership::takeover),
        )
        .route(
            "/runs/{run_id}/sessions/{session_id}/ownership/release",
            post(handlers::ownership::release),
        )
        .route(
            "/agents",
            get(handlers::agents::list_agents).post(handlers::agents::create_agent),
        )
        .route(
            "/agents/{name}",
            get(handlers::agents::get_agent)
                .patch(handlers::agents::patch_agent)
                .delete(handlers::agents::delete_agent),
        )
        .route(
            "/agents/{name}/restore",
            post(handlers::agents::restore_agent),
        )
        .route(
            "/providers/{provider}/models",
            get(handlers::model_catalog::list_provider_models),
        )
        .route("/runtimes", get(handlers::runtimes::list_runtimes))
        .route(
            "/runtimes/refresh",
            post(handlers::runtimes::refresh_runtimes),
        )
        .route(
            "/orchestrator-sessions",
            post(handlers::orchestrator_sessions::create_session)
                .get(handlers::orchestrator_sessions::list_sessions),
        )
        .route(
            "/orchestrator-sessions/{id}",
            get(handlers::orchestrator_sessions::get_session)
                .patch(handlers::orchestrator_sessions::patch_session),
        )
        .route(
            "/orchestrator-sessions/{id}/checkpoints",
            post(handlers::orchestrator_sessions::create_checkpoint)
                .get(handlers::orchestrator_sessions::list_checkpoints),
        )
        .route(
            "/launch-tasks",
            post(handlers::launch_tasks::create_launch_task)
                .get(handlers::launch_tasks::list_launch_tasks),
        )
        .route(
            "/launch-tasks/events",
            get(handlers::launch_tasks::launch_task_events_sse),
        )
        .route(
            "/launch-tasks/{id}",
            get(handlers::launch_tasks::get_launch_task),
        )
        .route(
            "/launch-tasks/{id}/steps",
            get(handlers::launch_tasks::list_launch_task_steps),
        )
        .route(
            "/launch-tasks/{id}/cancel",
            post(handlers::launch_tasks::cancel_launch_task),
        )
        .route(
            "/launch-tasks/{id}/retry",
            post(handlers::launch_tasks::retry_launch_task),
        )
        .route(
            "/launch-tasks/{id}/interventions",
            get(handlers::launch_tasks::list_launch_task_interventions)
                .post(handlers::launch_tasks::create_launch_task_intervention),
        )
        .route(
            "/launch-tasks/{id}/snapshot",
            get(handlers::snapshots::get_launch_task_snapshot),
        )
        .route(
            "/provider-settings",
            get(handlers::provider_settings::list_provider_settings),
        )
        .route(
            "/provider-settings/{provider}",
            patch(handlers::provider_settings::patch_provider_settings),
        )
        .route(
            "/skills",
            get(handlers::skills::list_skills).post(handlers::skills::create_skill),
        )
        .route(
            "/skills/importable",
            get(handlers::skills::list_importable_skills),
        )
        .route("/skills/import", post(handlers::skills::import_skills))
        .route(
            "/skills/{id}",
            patch(handlers::skills::patch_skill).delete(handlers::skills::delete_skill),
        )
        .route(
            "/launch-profiles",
            get(handlers::launch_profiles::list_profiles)
                .post(handlers::launch_profiles::create_profile),
        )
        .route(
            "/launch-profiles/preview",
            post(handlers::launch_profiles::preview_profile),
        )
        .route(
            "/launch-profiles/{id}",
            get(handlers::launch_profiles::get_profile)
                .patch(handlers::launch_profiles::patch_profile)
                .delete(handlers::launch_profiles::delete_profile),
        )
        .route(
            "/conversations",
            post(handlers::conversations::create_conversation)
                .get(handlers::conversations::list_conversations),
        )
        .route(
            "/conversations/{id}",
            get(handlers::conversations::get_conversation),
        )
        .route(
            "/conversations/{id}/turns",
            post(handlers::conversations::create_turn),
        )
        .route(
            "/conversations/{conversation_id}/turns/{turn_id}/cancel",
            post(handlers::conversations::cancel_turn),
        )
        .route(
            "/turns/{turn_id}/events",
            get(handlers::conversations::turn_events_stream),
        )
        .with_state(state)
}

#[cfg(feature = "embedded-ui")]
fn attach_ui(app: Router, serve_ui: bool) -> Router {
    if serve_ui {
        app.merge(ui_assets::router())
    } else {
        app
    }
}

#[cfg(not(feature = "embedded-ui"))]
fn attach_ui(app: Router, _serve_ui: bool) -> Router {
    app
}

/// Subscribe to every session lifecycle event on the shared `SessionBus` and
/// forward it onto the workspace-level bus (SUP-84). Runs for the lifetime of
/// the server; exits cleanly when the session bus closes.
fn spawn_session_lifecycle_forwarder(
    session_bus: Arc<SessionBus>,
    workspace_bus: Arc<WorkspaceEventBus>,
) {
    tokio::spawn(async move {
        let mut rx = session_bus.subscribe();
        loop {
            match rx.recv().await {
                Ok(event) => workspace_bus.publish(event.into()),
                Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!(
                        skipped,
                        "workspace lifecycle forwarder lagged; persisted audit stream \
                         remains authoritative"
                    );
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                    tracing::debug!("session bus closed; lifecycle forwarder exiting");
                    break;
                }
            }
        }
    });
}
