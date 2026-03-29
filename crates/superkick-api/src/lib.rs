use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use axum::Router;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Json};
use axum::routing::{get, post};
use serde::{Deserialize, Serialize};

use superkick_core::{
    CoreError, InterruptAction, InterruptId, LinkedRunSummary, Run, RunId, TriggerSource,
};
use superkick_integrations::linear::LinearClient;
use superkick_runtime::{InterruptService, RepoCache, StepEngine, StepEngineDeps};
use superkick_storage::repo::{InterruptRepo, RunEventRepo, RunRepo, RunStepRepo};
use superkick_storage::{
    SqliteAgentSessionRepo, SqliteArtifactRepo, SqliteInterruptRepo, SqliteRunEventRepo,
    SqliteRunRepo, SqliteRunStepRepo,
};

// ── App state ──────────────────────────────────────────────────────────

type Engine = StepEngine<
    SqliteRunRepo,
    SqliteRunStepRepo,
    SqliteRunEventRepo,
    SqliteAgentSessionRepo,
    SqliteArtifactRepo,
    SqliteInterruptRepo,
>;

type IntService = InterruptService<SqliteRunRepo, SqliteRunEventRepo, SqliteInterruptRepo>;

#[derive(Clone)]
struct AppState {
    run_repo: Arc<SqliteRunRepo>,
    step_repo: Arc<SqliteRunStepRepo>,
    event_repo: Arc<SqliteRunEventRepo>,
    interrupt_repo: Arc<SqliteInterruptRepo>,
    engine: Arc<Engine>,
    interrupt_service: Arc<IntService>,
    linear_client: Option<Arc<LinearClient>>,
    run_tokens: Arc<Mutex<HashMap<RunId, CancellationToken>>>,
    repo_slug: String,
    base_branch: String,
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
    let interrupt_repo = Arc::new(SqliteInterruptRepo::new(pool));

    let cache_root = PathBuf::from(&cfg.cache_dir);
    let repo_cache = RepoCache::new(cache_root).await?;

    let engine = Arc::new(StepEngine::new(StepEngineDeps {
        run_repo: Arc::clone(&run_repo),
        step_repo: Arc::clone(&step_repo),
        event_repo: Arc::clone(&event_repo),
        session_repo: Arc::clone(&session_repo),
        artifact_repo: Arc::clone(&artifact_repo),
        interrupt_repo: Arc::clone(&interrupt_repo),
        repo_cache,
        config,
    }));

    let interrupt_service = Arc::new(InterruptService::new(
        Arc::clone(&run_repo),
        Arc::clone(&event_repo),
        Arc::clone(&interrupt_repo),
    ));

    let linear_client = std::env::var("LINEAR_API_KEY")
        .ok()
        .filter(|k| !k.is_empty())
        .map(|key| Arc::new(LinearClient::new(key)));

    if linear_client.is_none() {
        tracing::warn!("LINEAR_API_KEY not set — /issues endpoint will return 503");
    }

    let state = AppState {
        run_repo,
        step_repo,
        event_repo,
        interrupt_repo,
        engine,
        interrupt_service,
        linear_client,
        run_tokens: Arc::new(Mutex::new(HashMap::new())),
        repo_slug,
        base_branch,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/config", get(get_config))
        .route("/issues", get(list_issues))
        .route("/issues/{id}", get(get_issue))
        .route("/runs", post(create_run).get(list_runs))
        .route("/runs/{id}", get(get_run))
        .route("/runs/{id}/events", get(get_run_events))
        .route("/runs/{id}/cancel", post(cancel_run))
        .route("/runs/{id}/interrupts", get(list_interrupts))
        .route(
            "/runs/{run_id}/interrupts/{interrupt_id}/answer",
            post(answer_interrupt),
        )
        .with_state(state);

    let local_addr = cfg.listener.local_addr()?;
    println!(
        "Superkick server running on http://127.0.0.1:{}",
        local_addr.port()
    );
    println!("Press Ctrl+C to stop.");
    tracing::info!("superkick-api listening on {local_addr}");

    axum::serve(cfg.listener, app).await?;

    Ok(())
}

// ── Handlers ───────────────────────────────────────────────────────────

async fn health() -> &'static str {
    "ok"
}

#[derive(Deserialize)]
struct ListIssuesParams {
    #[serde(default = "default_issue_limit")]
    limit: u32,
}

fn default_issue_limit() -> u32 {
    50
}

async fn list_issues(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<ListIssuesParams>,
) -> Result<impl IntoResponse, AppError> {
    let client = state
        .linear_client
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("LINEAR_API_KEY not configured"))?;

    let response = client
        .list_issues(params.limit)
        .await
        .map_err(AppError::Internal)?;

    Ok(Json(response))
}

async fn get_issue(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, AppError> {
    let client = state
        .linear_client
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("LINEAR_API_KEY not configured"))?;

    let mut detail = client.get_issue(&id).await.map_err(AppError::Internal)?;

    // Enrich with linked runs from superkick-storage (SUP-19 ready).
    let runs = state.run_repo.list_by_issue_id(&id).await?;
    detail.linked_runs = runs.iter().map(LinkedRunSummary::from).collect();

    Ok(Json(detail))
}

#[derive(Deserialize)]
struct CreateRunRequest {
    repo_slug: String,
    issue_id: String,
    issue_identifier: String,
    #[serde(default = "default_base_branch")]
    base_branch: String,
}

fn default_base_branch() -> String {
    "main".into()
}

async fn create_run(
    State(state): State<AppState>,
    Json(body): Json<CreateRunRequest>,
) -> Result<impl IntoResponse, AppError> {
    let repo_slug = body.repo_slug.trim().to_string();
    let issue_id = body.issue_id.trim().to_string();
    let issue_identifier = body.issue_identifier.trim().to_string();
    let base_branch = body.base_branch.trim().to_string();

    if repo_slug.is_empty() {
        return Err(AppError::BadRequest("repo_slug must not be empty".into()));
    }
    if issue_id.is_empty() {
        return Err(AppError::BadRequest("issue_id must not be empty".into()));
    }
    if issue_identifier.is_empty() {
        return Err(AppError::BadRequest(
            "issue_identifier must not be empty".into(),
        ));
    }
    if !repo_slug.contains('/') || repo_slug.starts_with('/') || repo_slug.ends_with('/') {
        return Err(AppError::BadRequest(
            "repo_slug must be in owner/repo format".into(),
        ));
    }

    let existing = state.run_repo.find_active_by_issue_id(&issue_id).await?;
    Run::guard_no_active(existing.as_ref(), &issue_identifier)?;

    let run = Run::new(
        issue_id,
        issue_identifier,
        repo_slug,
        TriggerSource::Manual,
        base_branch,
    );

    state.run_repo.insert(&run).await?;

    let engine = Arc::clone(&state.engine);
    let run_clone = run.clone();
    let token = CancellationToken::new();
    let spawn_token = token.clone();

    {
        let mut tokens = state.run_tokens.lock().await;
        tokens.insert(run.id, token);
    }

    let run_tokens = Arc::clone(&state.run_tokens);
    let run_id = run.id;
    tokio::spawn(async move {
        if let Err(e) = engine.execute(run_clone, spawn_token).await {
            tracing::error!(error = %e, "run execution failed");
        }
        run_tokens.lock().await.remove(&run_id);
    });

    Ok((StatusCode::CREATED, Json(run)))
}

async fn list_runs(State(state): State<AppState>) -> Result<Json<Vec<Run>>, AppError> {
    let runs = state.run_repo.list_all().await?;
    Ok(Json(runs))
}

async fn get_run(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);
    let run = state.run_repo.get(run_id).await?;
    let Some(run) = run else {
        return Err(AppError::NotFound("run not found"));
    };
    let steps = state.step_repo.list_by_run(run_id).await?;
    let interrupts = state.interrupt_repo.list_by_run(run_id).await?;

    Ok(Json(serde_json::json!({
        "run": run,
        "steps": steps,
        "interrupts": interrupts,
    })))
}

async fn get_run_events(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);

    let run = state.run_repo.get(run_id).await?;
    if run.is_none() {
        return Err(AppError::NotFound("run not found"));
    }

    let event_repo = Arc::clone(&state.event_repo);
    let run_repo = Arc::clone(&state.run_repo);

    let stream = async_stream::stream! {
        let mut offset: usize = 0;

        loop {
            let events = match event_repo.list_by_run_from_offset(run_id, offset).await {
                Ok(events) => events,
                Err(e) => {
                    yield Ok(Event::default().event("error").data(e.to_string()));
                    break;
                }
            };

            for event in &events {
                let data = match serde_json::to_string(event) {
                    Ok(d) => d,
                    Err(e) => {
                        yield Ok(Event::default().event("error").data(e.to_string()));
                        break;
                    }
                };
                yield Ok::<Event, std::convert::Infallible>(
                    Event::default().event("run_event").data(data)
                );
            }
            offset += events.len();

            if let Ok(Some(run)) = run_repo.get(run_id).await {
                if run.state.is_terminal() || run.state == superkick_core::RunState::Failed {
                    yield Ok(Event::default().event("done").data("run finished"));
                    break;
                }
            }

            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    };

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

async fn list_interrupts(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);
    let run = state.run_repo.get(run_id).await?;
    if run.is_none() {
        return Err(AppError::NotFound("run not found"));
    }
    let interrupts = state.interrupt_repo.list_by_run(run_id).await?;
    Ok(Json(interrupts))
}

async fn cancel_run(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let run_id = RunId(id);

    // Signal the running task to stop first.
    {
        let mut tokens = state.run_tokens.lock().await;
        if let Some(token) = tokens.remove(&run_id) {
            token.cancel();
        }
    }

    // Re-read run state after signalling — the task may have finished between
    // the signal and this read, so we check the current state to avoid
    // overwriting a completed run.
    let Some(mut run) = state.run_repo.get(run_id).await? else {
        return Err(AppError::NotFound("run not found"));
    };
    if run.state.is_terminal() || run.state == superkick_core::RunState::Failed {
        // Token was already cancelled above; the run finished on its own.
        return Ok(Json(run));
    }

    run.transition_to(superkick_core::RunState::Cancelled)
        .map_err(|e| AppError::Internal(e.into()))?;
    state.run_repo.update(&run).await?;
    Ok(Json(run))
}

async fn answer_interrupt(
    State(state): State<AppState>,
    Path((run_id, interrupt_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(action): Json<InterruptAction>,
) -> Result<impl IntoResponse, AppError> {
    state
        .interrupt_service
        .answer_interrupt(RunId(run_id), InterruptId(interrupt_id), action)
        .await?;
    Ok(StatusCode::OK)
}

// ── Config endpoint ───────────────────────────────────────────────────

#[derive(Serialize)]
struct ConfigResponse {
    repo_slug: String,
    base_branch: String,
}

async fn get_config(State(state): State<AppState>) -> Json<ConfigResponse> {
    Json(ConfigResponse {
        repo_slug: state.repo_slug.clone(),
        base_branch: state.base_branch.clone(),
    })
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
    parse_repo_slug(url.trim())
}

fn parse_repo_slug(url: &str) -> Option<String> {
    // SSH: git@github.com:owner/repo.git
    if let Some(path) = url.strip_prefix("git@github.com:") {
        let slug = path.strip_suffix(".git").unwrap_or(path);
        if slug.contains('/') && !slug.starts_with('/') {
            return Some(slug.to_string());
        }
    }
    // HTTPS: https://github.com/owner/repo.git
    if let Some(rest) = url
        .strip_prefix("https://github.com/")
        .or_else(|| url.strip_prefix("http://github.com/"))
    {
        let slug = rest.strip_suffix(".git").unwrap_or(rest);
        let slug = slug.trim_end_matches('/');
        if slug.contains('/') && slug.matches('/').count() == 1 {
            return Some(slug.to_string());
        }
    }
    None
}

// ── Error handling ─────────────────────────────────────────────────────

enum AppError {
    Internal(anyhow::Error),
    NotFound(&'static str),
    BadRequest(String),
    Conflict {
        message: String,
        active_run_id: String,
        active_run_state: String,
    },
    ServiceUnavailable(&'static str),
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Internal(err)
    }
}

impl From<CoreError> for AppError {
    fn from(err: CoreError) -> Self {
        match err {
            CoreError::DuplicateActiveRun {
                ref issue_identifier,
                ref active_run_id,
                ref state,
            } => AppError::Conflict {
                message: format!("issue {issue_identifier} already has an active run ({state})"),
                active_run_id: active_run_id.0.to_string(),
                active_run_state: state.to_string(),
            },
            other => AppError::Internal(other.into()),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        match self {
            AppError::Internal(err) => {
                tracing::error!(error = %err, "internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": err.to_string() })),
                )
                    .into_response()
            }
            AppError::NotFound(msg) => (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": msg })),
            )
                .into_response(),
            AppError::BadRequest(msg) => (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": msg })),
            )
                .into_response(),
            AppError::Conflict {
                message,
                active_run_id,
                active_run_state,
            } => (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": message,
                    "active_run_id": active_run_id,
                    "active_run_state": active_run_state,
                })),
            )
                .into_response(),
            AppError::ServiceUnavailable(msg) => (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "error": msg })),
            )
                .into_response(),
        }
    }
}
