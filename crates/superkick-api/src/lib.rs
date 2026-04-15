use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use axum::Router;
use axum::routing::{get, post};

use superkick_config::LaunchProfileConfig;
use superkick_core::RunId;
use superkick_integrations::linear::LinearClient;
use superkick_runtime::{
    AttentionService, InterruptService, PtySessionRegistry, RepoCache, StepEngine, StepEngineDeps,
};
use superkick_storage::{
    SqliteAgentSessionRepo, SqliteArtifactRepo, SqliteAttentionRequestRepo, SqliteInterruptRepo,
    SqlitePullRequestRepo, SqliteRunEventRepo, SqliteRunRepo, SqliteRunStepRepo,
    SqliteTranscriptRepo,
};

mod error;
mod handlers;

// ── App state ──────────────────────────────────────────────────────────

type Engine = StepEngine<
    SqliteRunRepo,
    SqliteRunStepRepo,
    SqliteRunEventRepo,
    SqliteAgentSessionRepo,
    SqliteArtifactRepo,
    SqliteInterruptRepo,
    SqliteTranscriptRepo,
>;

type IntService = InterruptService<SqliteRunRepo, SqliteRunEventRepo, SqliteInterruptRepo>;

type AttnService = AttentionService<SqliteAttentionRequestRepo, SqliteRunEventRepo, SqliteRunRepo>;

#[derive(Clone)]
pub(crate) struct AppState {
    pub run_repo: Arc<SqliteRunRepo>,
    pub step_repo: Arc<SqliteRunStepRepo>,
    pub event_repo: Arc<SqliteRunEventRepo>,
    pub session_repo: Arc<SqliteAgentSessionRepo>,
    pub artifact_repo: Arc<SqliteArtifactRepo>,
    pub interrupt_repo: Arc<SqliteInterruptRepo>,
    pub attention_repo: Arc<SqliteAttentionRequestRepo>,
    pub pr_repo: Arc<SqlitePullRequestRepo>,
    pub transcript_repo: Arc<SqliteTranscriptRepo>,
    pub engine: Arc<Engine>,
    pub interrupt_service: Arc<IntService>,
    pub attention_service: Arc<AttnService>,
    pub pty_registry: Arc<PtySessionRegistry>,
    pub linear_client: Option<Arc<LinearClient>>,
    pub run_tokens: Arc<Mutex<HashMap<RunId, CancellationToken>>>,
    pub repo_slug: String,
    pub base_branch: String,
    pub launch_profile: LaunchProfileConfig,
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
    let repo_slug = detect_repo_slug().unwrap_or_else(|| {
        tracing::warn!("could not detect repo_slug from git remote — /config will return empty");
        String::new()
    });

    let pool = superkick_storage::connect(&cfg.database_url).await?;

    let run_repo = Arc::new(SqliteRunRepo::new(pool.clone()));
    let step_repo = Arc::new(SqliteRunStepRepo::new(pool.clone()));
    let event_repo = Arc::new(SqliteRunEventRepo::new(pool.clone()));
    let session_repo = Arc::new(SqliteAgentSessionRepo::new(pool.clone()));
    let artifact_repo = Arc::new(SqliteArtifactRepo::new(pool.clone()));
    let pr_repo = Arc::new(SqlitePullRequestRepo::new(pool.clone()));
    let interrupt_repo = Arc::new(SqliteInterruptRepo::new(pool.clone()));
    let attention_repo = Arc::new(SqliteAttentionRequestRepo::new(pool.clone()));

    let transcript_repo = Arc::new(SqliteTranscriptRepo::new(pool));
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
        transcript_repo: Arc::clone(&transcript_repo),
        registry: Arc::clone(&pty_registry),
        repo_cache,
        config,
        linear_client: linear_client.clone(),
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
        engine,
        interrupt_service,
        attention_service,
        pty_registry,
        linear_client,
        run_tokens: Arc::new(Mutex::new(HashMap::new())),
        repo_slug,
        base_branch,
        launch_profile,
    };

    let app = Router::new()
        .route("/health", get(handlers::health::health))
        .route("/config", get(handlers::health::get_config))
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
