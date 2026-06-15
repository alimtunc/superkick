//! Test-only router builders, gated behind the `test-support` feature so
//! none of this reaches production callers. Each builder wires a route subset
//! against the minimal state slice it needs, so integration tests don't have
//! to materialise the full `AppState`.

use std::path::PathBuf;
use std::sync::Arc;

use axum::Router;
use axum::routing::{get, post};

use superkick_config::RunnerConfig;
use superkick_core::AgentCatalog;
use superkick_runtime::{LaunchTaskEventBus, LaunchTaskExecutor, LaunchTaskRegistry};
use superkick_storage::{
    SqliteAgentSessionRepo, SqliteDiffReviewRepo, SqliteIssueWorkspaceContextRepo,
    SqliteLaunchTaskInterventionRepo, SqliteLaunchTaskRepo, SqliteOrchestratorSessionRepo,
    SqliteRunContextSnapshotRepo, SqliteRunRepo,
};

use crate::{EventRepo, handlers};

pub mod tests_only {
    use superkick_core::{
        CoreError, DiffReviewFixPromptComment, DiffReviewLineSide, render_diff_review_fix_prompt,
    };

    use crate::error::AppError;

    /// Run the `CoreError → AppError` mapping that handlers rely on, for
    /// integration tests that need to assert HTTP status pinning without
    /// going through a full handler invocation.
    pub fn map_core_error(err: CoreError) -> AppError {
        AppError::from(err)
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    pub struct FixPromptCommentForTest {
        pub file_path: String,
        pub side: String,
        pub old_line: Option<u32>,
        pub new_line: Option<u32>,
        pub old_line_end: Option<u32>,
        pub new_line_end: Option<u32>,
        pub body: String,
    }

    pub fn render_fix_with_ai_prompt_for_test(
        issue_identifier: &str,
        source_run_id: superkick_core::RunId,
        source_branch: Option<&str>,
        base_ref: &str,
        head_ref: &str,
        comments: &[FixPromptCommentForTest],
        snapshot_json: Option<&str>,
    ) -> String {
        let comments = comments
            .iter()
            .map(|comment| DiffReviewFixPromptComment {
                file_path: comment.file_path.clone(),
                side: match comment.side.as_str() {
                    "old" => DiffReviewLineSide::Old,
                    "new" => DiffReviewLineSide::New,
                    "context" => DiffReviewLineSide::Context,
                    other => panic!("unsupported test comment side: {other}"),
                },
                old_line: comment.old_line,
                old_line_end: comment.old_line_end,
                new_line: comment.new_line,
                new_line_end: comment.new_line_end,
                body: comment.body.clone(),
            })
            .collect::<Vec<_>>();
        render_diff_review_fix_prompt(
            issue_identifier,
            &format!("run {source_run_id}"),
            source_branch,
            base_ref,
            head_ref,
            &comments,
            snapshot_json,
        )
    }
}

/// Re-export of the issue-context handler types tests need to assemble a
/// router (`IssueLookup`, the two dyn-repo traits).
pub mod test_handlers {
    pub use crate::handlers::issue_context::{IssueContextState, IssueLookup};
    pub use crate::handlers::issues::{IssueWritesState, LinearFuture, LinearWriter};
    pub use superkick_storage::repo::{IssueWorkspaceContextRepoDyn, MemoryEntryRepoDyn};
}

/// Orchestrator session + checkpoint routes against the repo alone.
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

/// `GET /agents` against an `AgentsState` built from the supplied catalog.
pub fn agents_test_router(catalog: AgentCatalog) -> Router {
    let state = handlers::agents::AgentsState {
        catalog: superkick_runtime::AgentCatalogProvider::new(catalog),
    };
    Router::new()
        .route("/agents", get(handlers::agents::list_agents))
        .with_state(state)
}

/// Stateless per-provider model catalog route.
pub fn model_catalog_test_router() -> Router {
    Router::new().route(
        "/providers/{provider}/models",
        get(handlers::model_catalog::list_provider_models),
    )
}

/// Launch-task read/create/cancel/SSE routes against a fresh in-memory
/// `LaunchTaskState` with the stub step runner — sufficient for HTTP-shape
/// tests; behavioural tests of the executor live in `superkick-runtime/tests`.
#[allow(clippy::too_many_arguments)]
pub fn launch_task_test_router(
    repo: Arc<SqliteLaunchTaskRepo>,
    intervention_repo: Arc<SqliteLaunchTaskInterventionRepo>,
    run_repo: Arc<SqliteRunRepo>,
    session_repo: Arc<SqliteAgentSessionRepo>,
    event_repo: Arc<EventRepo>,
    issue_workspace_context_repo: Arc<SqliteIssueWorkspaceContextRepo>,
    snapshot_repo: Arc<SqliteRunContextSnapshotRepo>,
    catalog: Arc<AgentCatalog>,
) -> Router {
    use superkick_runtime::StubStepRunner;
    let bus = LaunchTaskEventBus::new();
    let executor = LaunchTaskExecutor::new(
        Arc::clone(&repo),
        Arc::clone(&bus),
        Arc::new(LaunchTaskRegistry::new()),
        Arc::new(StubStepRunner::new()),
    );
    // SUP-203 — the retry handler refreshes the derived snapshot, so the test
    // router wires the same read repos + snapshot cache the production
    // `FromRef<AppState>` provides (callers build them off the shared pool).
    let state = handlers::launch_tasks::LaunchTaskState::<StubStepRunner> {
        repo,
        intervention_repo,
        run_repo,
        session_repo,
        event_repo,
        issue_workspace_context_repo,
        snapshot_repo,
        catalog,
        bus,
        executor,
        // The test router exercises only the legacy triplet path; dynamic
        // composition is covered at the runtime layer.
        launch_profile_service: None,
        // Tests assert against synchronous create-time state; the executor
        // itself is covered at the runtime layer.
        auto_trigger_executor: false,
        // No Linear integration in the test router; auto-transition is a no-op.
        linear_client: None,
        auto_transition_in_progress: false,
    };
    Router::new()
        .route(
            "/launch-tasks",
            post(handlers::launch_tasks::create_launch_task)
                .get(handlers::launch_tasks::list_launch_tasks),
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
            "/launch-tasks/events",
            get(handlers::launch_tasks::launch_task_events_sse),
        )
        .with_state(state)
}

/// GET+PUT `/config/runner` against a config path and boot-time runner
/// snapshot the test controls.
pub fn runner_config_test_router(config_path: PathBuf, boot_runner: RunnerConfig) -> Router {
    let state = handlers::config::RunnerConfigState {
        config_path,
        boot_runner,
    };
    Router::new()
        .route(
            "/config/runner",
            get(handlers::config::get_runner_config).put(handlers::config::put_runner_config),
        )
        .with_state(state)
}

pub fn reusable_worktree_test_router(run_repo: Arc<SqliteRunRepo>) -> Router {
    let state = handlers::issues::ReusableWorktreeState { run_repo };
    Router::new()
        .route(
            "/issues/{id}/reusable-worktree",
            get(handlers::issues::get_reusable_worktree),
        )
        .with_state(state)
}

pub fn launch_profile_config_test_router(
    config_path: PathBuf,
    boot_runner: RunnerConfig,
) -> Router {
    let state = handlers::config::RunnerConfigState {
        config_path,
        boot_runner,
    };
    Router::new()
        .route(
            "/config/launch-profile",
            axum::routing::patch(handlers::config::patch_launch_profile),
        )
        .with_state(state)
}

/// `GET /runs/{id}/diff` against a `RunDiffState`. Tests pre-seed runs through
/// the repo and point `worktree_path` at a temp git repo they control.
pub fn run_diff_test_router(repo: Arc<SqliteRunRepo>, base_branch: String) -> Router {
    let state = handlers::runs::RunDiffState {
        run_repo: repo,
        base_branch,
    };
    Router::new()
        .route("/runs/{id}/diff", get(handlers::runs::get_run_diff))
        .with_state(state)
}

/// Local run-review routes against the run repo plus review repo.
pub fn run_review_test_router(
    run_repo: Arc<SqliteRunRepo>,
    review_repo: Arc<SqliteDiffReviewRepo>,
) -> Router {
    let state = handlers::run_reviews::RunReviewState {
        run_repo,
        review_repo,
    };
    Router::new()
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
            axum::routing::patch(handlers::run_reviews::patch_thread)
                .delete(handlers::run_reviews::delete_thread),
        )
        .route(
            "/runs/{id}/review/threads/{thread_id}/comments",
            post(handlers::run_reviews::add_comment),
        )
        .route(
            "/runs/{id}/review/threads/{thread_id}/comments/{comment_id}",
            axum::routing::patch(handlers::run_reviews::patch_comment)
                .delete(handlers::run_reviews::delete_comment),
        )
        .route(
            "/runs/{id}/review/files/reviewed",
            post(handlers::run_reviews::set_file_reviewed),
        )
        .with_state(state)
}

/// `GET /launch-tasks/{id}/snapshot` against real in-memory SQLite repos.
pub fn run_context_snapshot_test_router(
    launch_task_repo: Arc<SqliteLaunchTaskRepo>,
    run_repo: Arc<SqliteRunRepo>,
    session_repo: Arc<SqliteAgentSessionRepo>,
    event_repo: Arc<EventRepo>,
    issue_workspace_context_repo: Arc<SqliteIssueWorkspaceContextRepo>,
    snapshot_repo: Arc<SqliteRunContextSnapshotRepo>,
) -> Router {
    let state = handlers::snapshots::SnapshotState {
        launch_task_repo,
        run_repo,
        session_repo,
        event_repo,
        issue_workspace_context_repo,
        snapshot_repo,
    };
    Router::new()
        .route(
            "/launch-tasks/{id}/snapshot",
            get(handlers::snapshots::get_launch_task_snapshot),
        )
        .with_state(state)
}

/// Linear write paths (`POST /issues`, `PATCH /issues/{id}`,
/// `POST /issues/{id}/comments`, `GET /linear/options`).
pub fn linear_writes_test_router(writer: Option<Arc<dyn test_handlers::LinearWriter>>) -> Router {
    let state = test_handlers::IssueWritesState {
        linear_writer: writer,
    };
    Router::new()
        .route("/issues", post(handlers::issues::create_issue))
        .route(
            "/issues/{id}",
            axum::routing::patch(handlers::issues::patch_issue),
        )
        .route(
            "/issues/{id}/comments",
            post(handlers::issues::create_comment),
        )
        .route(
            "/linear/options",
            get(handlers::linear_options::get_options),
        )
        .with_state(state)
}

/// Issue-context + memory routes against injected repos and an
/// [`handlers::issue_context::IssueLookup`] stub, so the suite never hits
/// Linear.
pub fn issue_context_test_router(
    context_repo: Arc<dyn test_handlers::IssueWorkspaceContextRepoDyn>,
    memory_repo: Arc<dyn test_handlers::MemoryEntryRepoDyn>,
    issue_lookup: Option<Arc<dyn test_handlers::IssueLookup>>,
) -> Router {
    let state = test_handlers::IssueContextState {
        context_repo,
        memory_repo,
        issue_lookup,
    };
    Router::new()
        .route(
            "/issues/{id}/context",
            get(handlers::issue_context::get_or_create_context),
        )
        .route(
            "/issues/{id}/context/memory",
            get(handlers::issue_context::list_memory).post(handlers::issue_context::append_memory),
        )
        .with_state(state)
}
