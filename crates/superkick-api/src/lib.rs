use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use axum::Router;
use axum::routing::{get, post};

use superkick_config::{IssueTrigger, LaunchProfileConfig, OrchestrationConfig};
use superkick_core::RunId;
use superkick_integrations::linear::LinearClient;
use superkick_runtime::{
    AttentionService, ConversationAdapters, ConversationRunner, InterruptService, OwnershipService,
    PtySessionRegistry, PublishingRunEventRepo, RepoCache, RuntimeDetector, SessionBus, StepEngine,
    StepEngineDeps, TurnEventBus, WorkspaceEventBus, boot_refresh as runtime_boot_refresh,
    spawn_heartbeat_listener,
};
use superkick_storage::{
    SqliteAgentSessionRepo, SqliteArtifactRepo, SqliteAttentionRequestRepo, SqliteConversationRepo,
    SqliteInterruptRepo, SqliteIssueBlockerRepo, SqliteOrchestratorSessionRepo,
    SqlitePullRequestRepo, SqliteRecoveryEventRepo, SqliteRunEventRepo, SqliteRunRepo,
    SqliteRunStepRepo, SqliteRuntimeRepo, SqliteSessionOwnershipRepo, SqliteTranscriptRepo,
    SqliteTurnEventRepo, SqliteTurnRepo,
};

mod error;
mod handlers;
pub mod recovery_scheduler;

/// Test-only router builder for the SUP-102 orchestrator session routes.
///
/// Production wires these routes onto the full `AppState` in `run_server`;
/// this helper builds the same five routes against the `SqliteOrchestratorSessionRepo`
/// alone so integration tests don't have to rebuild the entire app state.
/// Gated behind the `test-support` feature so it never reaches production
/// callers — only the integration tests in this crate enable it.
#[cfg(feature = "test-support")]
pub fn orchestrator_session_test_router(repo: Arc<SqliteOrchestratorSessionRepo>) -> Router {
    Router::new()
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
        .with_state(repo)
}

// ── App state ──────────────────────────────────────────────────────────

/// Every run-event writer in the process goes through this wrapper so the
/// workspace-level `WorkspaceEventBus` (SUP-84) sees every persisted event
/// without service-level changes.
type EventRepo = PublishingRunEventRepo<SqliteRunEventRepo>;

type Engine = StepEngine<
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

#[derive(Clone)]
pub(crate) struct AppState {
    pub run_repo: Arc<SqliteRunRepo>,
    pub step_repo: Arc<SqliteRunStepRepo>,
    pub event_repo: Arc<EventRepo>,
    pub session_repo: Arc<SqliteAgentSessionRepo>,
    pub artifact_repo: Arc<SqliteArtifactRepo>,
    pub interrupt_repo: Arc<SqliteInterruptRepo>,
    pub attention_repo: Arc<SqliteAttentionRequestRepo>,
    pub pr_repo: Arc<SqlitePullRequestRepo>,
    pub transcript_repo: Arc<SqliteTranscriptRepo>,
    pub issue_blocker_repo: Arc<SqliteIssueBlockerRepo>,
    pub recovery_event_repo: Arc<SqliteRecoveryEventRepo>,
    /// SUP-102 — orchestrator session + checkpoint store. Independent of the
    /// run pipeline; lives next to it as a parallel aggregate.
    pub orchestrator_session_repo: Arc<SqliteOrchestratorSessionRepo>,
    pub runtime_detector: Arc<RuntimeDetector>,
    /// Serialises `reconcile_blockers` so two concurrent `GET /launch-queue`
    /// calls cannot both publish the same `DependencyResolved` transition
    /// (SUP-81). Held only around the diff+persist+emit window.
    pub blocker_reconcile_lock: Arc<Mutex<()>>,
    pub engine: Arc<Engine>,
    pub interrupt_service: Arc<IntService>,
    pub attention_service: Arc<AttnService>,
    pub ownership_service: Arc<OwnService>,
    pub pty_registry: Arc<PtySessionRegistry>,
    pub workspace_bus: Arc<WorkspaceEventBus>,
    pub conversation_repo: Arc<SqliteConversationRepo>,
    pub turn_repo: Arc<SqliteTurnRepo>,
    pub turn_event_repo: Arc<SqliteTurnEventRepo>,
    pub conversation_runner: Arc<ChatRunner>,
    pub linear_client: Option<Arc<LinearClient>>,
    pub run_tokens: Arc<Mutex<HashMap<RunId, CancellationToken>>>,
    pub repo_slug: String,
    pub base_branch: String,
    pub launch_profile: LaunchProfileConfig,
    pub orchestration: OrchestrationConfig,
    pub issue_trigger: IssueTrigger,
    /// Run-level budget snapshot applied to every new run at launch time.
    /// Computed once from `BudgetConfig` on boot; mid-flight config changes do
    /// not retroactively affect in-flight runs.
    pub run_budget: superkick_core::RunBudget,
}

// ── Server config ─────────────────────────────────────────────────────

pub struct ServerConfig {
    pub config_path: String,
    pub database_url: String,
    pub cache_dir: String,
    /// Pre-bound TCP listener. Avoids TOCTOU races on port availability.
    pub listener: tokio::net::TcpListener,
}

// ── Public entry point ────────────────────────────────────────────────

pub async fn run_server(cfg: ServerConfig) -> anyhow::Result<()> {
    let config = superkick_config::load_file(std::path::Path::new(&cfg.config_path))?;
    let base_branch = config.runner.base_branch.clone();
    let launch_profile = config.launch_profile.clone();
    let orchestration = config.orchestration.clone();
    let issue_trigger = config.issue_source.trigger;
    let run_budget = config.budget.run_budget_snapshot();
    let recovery_config = config.recovery.to_recovery_config();
    let repo_slug = detect_repo_slug().unwrap_or_else(|| {
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
    let step_repo = Arc::new(SqliteRunStepRepo::new(pool.clone()));
    let event_repo = Arc::new(PublishingRunEventRepo::new(
        SqliteRunEventRepo::new(pool.clone()),
        Arc::clone(&workspace_bus),
    ));
    let session_repo = Arc::new(SqliteAgentSessionRepo::new(pool.clone()));
    let artifact_repo = Arc::new(SqliteArtifactRepo::new(pool.clone()));
    let pr_repo = Arc::new(SqlitePullRequestRepo::new(pool.clone()));
    let interrupt_repo = Arc::new(SqliteInterruptRepo::new(pool.clone()));
    let attention_repo = Arc::new(SqliteAttentionRequestRepo::new(pool.clone()));
    let ownership_repo = Arc::new(SqliteSessionOwnershipRepo::new(pool.clone()));
    let issue_blocker_repo = Arc::new(SqliteIssueBlockerRepo::new(pool.clone()));
    let recovery_event_repo = Arc::new(SqliteRecoveryEventRepo::new(pool.clone()));
    let orchestrator_session_repo = Arc::new(SqliteOrchestratorSessionRepo::new(pool.clone()));
    let runtime_repo = Arc::new(SqliteRuntimeRepo::new(pool.clone()));
    let runtime_detector = Arc::new(RuntimeDetector::new(Arc::clone(&runtime_repo)));

    let transcript_repo = Arc::new(SqliteTranscriptRepo::new(pool.clone()));
    let conversation_repo = Arc::new(SqliteConversationRepo::new(pool.clone()));
    let turn_repo = Arc::new(SqliteTurnRepo::new(pool.clone()));
    let turn_event_repo = Arc::new(SqliteTurnEventRepo::new(pool));
    let pty_registry = Arc::new(PtySessionRegistry::new());

    let cache_root = PathBuf::from(&cfg.cache_dir);
    let repo_cache = RepoCache::new(cache_root).await?;

    let linear_client = std::env::var("LINEAR_API_KEY")
        .ok()
        .filter(|k| !k.is_empty())
        .map(|key| Arc::new(LinearClient::new(key)));

    if linear_client.is_none() {
        tracing::warn!(
            "LINEAR_API_KEY not set — /issues endpoint will return 503 and child agent \
             roles configured for linear_context will downgrade to `none`"
        );
    }

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

    // SUP-73 — start the heartbeat listener (stamps `runs.last_heartbeat_at`
    // from `SessionBus` events) and the recovery scheduler (periodic
    // Healthy↔Stalled classification).
    spawn_heartbeat_listener(Arc::clone(&session_bus), Arc::clone(&run_repo));
    recovery_scheduler::spawn_recovery_scheduler(
        Arc::clone(&recovery_event_repo),
        Arc::clone(&workspace_bus),
        recovery_config,
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

    let state = AppState {
        run_repo,
        step_repo,
        event_repo,
        session_repo,
        artifact_repo,
        interrupt_repo,
        attention_repo,
        pr_repo,
        transcript_repo,
        issue_blocker_repo,
        recovery_event_repo,
        orchestrator_session_repo,
        runtime_detector,
        blocker_reconcile_lock: Arc::new(Mutex::new(())),
        engine,
        interrupt_service,
        attention_service,
        ownership_service,
        pty_registry,
        workspace_bus,
        conversation_repo,
        turn_repo,
        turn_event_repo,
        conversation_runner,
        linear_client,
        run_tokens: Arc::new(Mutex::new(HashMap::new())),
        repo_slug,
        base_branch,
        launch_profile,
        orchestration,
        issue_trigger,
        run_budget,
    };

    let app = Router::new()
        .route("/health", get(handlers::health::health))
        .route("/config", get(handlers::health::get_config))
        .route("/dashboard/queue", get(handlers::dashboard::get_queue))
        .route("/launch-queue", get(handlers::launch_queue::get_queue))
        .route(
            "/launch-queue/{issue_identifier}/dispatch",
            post(handlers::launch_queue::dispatch_from_queue),
        )
        .route("/events", get(handlers::events::workspace_events))
        .route("/issues", get(handlers::issues::list_issues))
        .route("/issues/{id}", get(handlers::issues::get_issue))
        .route(
            "/runs",
            post(handlers::runs::create_run).get(handlers::runs::list_runs),
        )
        .route("/runs/{id}", get(handlers::runs::get_run))
        .route("/runs/{id}/events", get(handlers::runs::get_run_events))
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
        // Console endpoint removed (SUP-75): operator input now goes directly via PTY terminal.
        .route(
            "/runs/{id}/terminal",
            get(handlers::terminal::attach_terminal),
        )
        .route(
            "/runs/{id}/terminal-history",
            get(handlers::terminal::get_terminal_history),
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
            "/conversations",
            post(handlers::conversations::create_or_get_conversation)
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
        .with_state(state);

    let local_addr = cfg.listener.local_addr()?;
    tracing::info!(
        "Superkick server running on http://127.0.0.1:{}",
        local_addr.port()
    );
    tracing::info!("Press Ctrl+C to stop.");

    axum::serve(cfg.listener, app).await?;

    Ok(())
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

fn detect_repo_slug() -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["remote", "get-url", "origin"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let url = String::from_utf8_lossy(&output.stdout);
    superkick_config::parse_repo_slug(url.trim())
}
