use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Json};
use axum::routing::{get, post};
use serde::Deserialize;

use superkick_core::{InterruptAction, InterruptId, Run, RunId, TriggerSource};
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

    let state = AppState {
        run_repo,
        step_repo,
        event_repo,
        interrupt_repo,
        engine,
        interrupt_service,
    };

    let app = Router::new()
        .route("/health", get(health))
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
    println!("Superkick server running on http://127.0.0.1:{}", local_addr.port());
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
    tokio::spawn(async move {
        if let Err(e) = engine.execute(run_clone).await {
            tracing::error!(error = %e, "run execution failed");
        }
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
    let Some(mut run) = state.run_repo.get(run_id).await? else {
        return Err(AppError::NotFound("run not found"));
    };
    if run.state.is_terminal() || run.state == superkick_core::RunState::Failed {
        return Err(AppError::BadRequest(format!(
            "run is already in terminal state: {}",
            run.state
        )));
    }
    // TODO: This only updates DB state. A running StepEngine task is not
    // signalled yet — it will continue until its next step boundary.
    // Fix: thread a CancellationToken into StepEngine and trigger it here.
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

// ── Error handling ─────────────────────────────────────────────────────

enum AppError {
    Internal(anyhow::Error),
    NotFound(&'static str),
    BadRequest(String),
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Internal(err)
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
        }
    }
}
