//! SUP-116 — launch task HTTP smoke tests.
//!
//! Drives the four `/launch-tasks` routes against a real in-memory SQLite
//! and an inlined three-role catalog. Pins:
//!   - happy-path POST then GET returns the task and ordered steps;
//!   - unknown agent on POST → 400 (`CoreError::InvalidInput`);
//!   - GET on a fresh UUID → 404;
//!   - the combined `list(status?, linear_issue_id?)` query filters work;
//!   - the 409 mapping for invalid task/step transitions is wired so
//!     SUP-118's execution loop renders consistent errors.

use std::collections::HashMap;
use std::sync::Arc;

mod common;
use common::{get_json, post_json, read_json};

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::response::IntoResponse;
use serde_json::{Value, json};
use sqlx::SqlitePool;
use superkick_api::launch_task_test_router;
use superkick_core::{
    AgentCatalog, AgentProvider, CoreAgentDefinition, CoreError, ExecutionMode, HandoffStatus,
    LaunchTaskId, LaunchTaskStatus, LaunchTaskStepStatus, LinearContextMode,
    RUN_CONTEXT_SNAPSHOT_VERSION, ResolvedMcpPolicy, ResolvedToolPolicy, Run, RunState,
    TriggerSource,
};
use superkick_runtime::{PublishingRunEventRepo, WorkspaceEventBus};
use superkick_storage::connect;
use superkick_storage::repo::{
    LaunchTaskInterventionRepo, LaunchTaskRepo, RunContextSnapshotRepo, RunRepo,
};
use superkick_storage::{
    SqliteAgentSessionRepo, SqliteIssueWorkspaceContextRepo, SqliteLaunchTaskInterventionRepo,
    SqliteLaunchTaskRepo, SqliteRunContextSnapshotRepo, SqliteRunEventRepo, SqliteRunRepo,
};
use tower::ServiceExt;

fn agent(name: &str, provider: AgentProvider, model: Option<&str>) -> CoreAgentDefinition {
    CoreAgentDefinition {
        name: name.into(),
        provider,
        role: None,
        model: model.map(String::from),
        system_prompt: None,
        timeout_secs: None,
        max_turns: None,
        origin: superkick_core::AgentOrigin::Custom,
        linear_context: LinearContextMode::default(),
        mcp_policy: ResolvedMcpPolicy::default(),
        tool_policy: ResolvedToolPolicy::default(),
        backend: None,
        runner_mode: None,
        billing_profile: None,
    }
}

fn catalog() -> AgentCatalog {
    let mut roles: HashMap<String, CoreAgentDefinition> = HashMap::new();
    roles.insert(
        "planner".into(),
        agent("planner", AgentProvider::Claude, Some("opus-4-7")),
    );
    roles.insert(
        "coder".into(),
        agent("coder", AgentProvider::Claude, Some("sonnet-4-6")),
    );
    roles.insert(
        "reviewer".into(),
        agent("reviewer", AgentProvider::Codex, None),
    );
    AgentCatalog::new(roles)
}

/// SUP-203 — the read repos + snapshot cache the retry handler regenerates the
/// derived `RunContextSnapshot` from. Built off the shared test pool so the
/// snapshot row lands in the same SQLite the assertions read.
fn snapshot_repos(
    pool: &SqlitePool,
) -> (
    Arc<SqliteAgentSessionRepo>,
    Arc<PublishingRunEventRepo<SqliteRunEventRepo>>,
    Arc<SqliteIssueWorkspaceContextRepo>,
    Arc<SqliteRunContextSnapshotRepo>,
) {
    (
        Arc::new(SqliteAgentSessionRepo::new(pool.clone())),
        Arc::new(PublishingRunEventRepo::new(
            SqliteRunEventRepo::new(pool.clone()),
            WorkspaceEventBus::new(),
        )),
        Arc::new(SqliteIssueWorkspaceContextRepo::new(pool.clone())),
        Arc::new(SqliteRunContextSnapshotRepo::new(pool.clone())),
    )
}

/// Wires the `/launch-tasks` router against a fresh in-memory SQLite and the
/// inlined three-role catalog, returning the repo handles and pool so tests can
/// seed state or read rows directly. The `router*` helpers project the subset
/// each test needs.
async fn test_app() -> (
    axum::Router,
    Arc<SqliteLaunchTaskRepo>,
    Arc<SqliteRunRepo>,
    Arc<SqliteLaunchTaskInterventionRepo>,
    SqlitePool,
) {
    let pool = connect("sqlite::memory:").await.expect("pool");
    let repo = Arc::new(SqliteLaunchTaskRepo::new(pool.clone()));
    let interventions = Arc::new(SqliteLaunchTaskInterventionRepo::new(pool.clone()));
    let run_repo = Arc::new(SqliteRunRepo::new(pool.clone()));
    let (sessions, events, workspaces, snapshots) = snapshot_repos(&pool);
    let router = launch_task_test_router(
        Arc::clone(&repo),
        Arc::clone(&interventions),
        Arc::clone(&run_repo),
        sessions,
        events,
        workspaces,
        snapshots,
        Arc::new(catalog()),
    );
    (router, repo, run_repo, interventions, pool)
}

async fn router() -> axum::Router {
    test_app().await.0
}

/// Variant of `router()` that returns the run repo so the dedup-guard test can
/// seed an active run for an issue before the launch-task POST.
async fn router_with_run_repo() -> (axum::Router, Arc<SqliteRunRepo>) {
    let (router, _, run_repo, ..) = test_app().await;
    (router, run_repo)
}

/// Variant of `router()` that returns the repo handle alongside the router so
/// retry tests can seed state directly (move a task into `NeedsHuman` etc.)
/// without a real executor loop.
async fn router_with_repo() -> (axum::Router, Arc<SqliteLaunchTaskRepo>) {
    let (router, repo, ..) = test_app().await;
    (router, repo)
}

/// Variant of `router_with_repo` that also surfaces the intervention repo so
/// SUP-154 tests can seed pre-existing interventions and assert against
/// `mark_consumed` round-trips without going through the handler.
async fn router_with_intervention_repo() -> (
    axum::Router,
    Arc<SqliteLaunchTaskRepo>,
    Arc<SqliteLaunchTaskInterventionRepo>,
) {
    let (router, repo, _, interventions, _) = test_app().await;
    (router, repo, interventions)
}

async fn post_no_body(app: &axum::Router, uri: &str) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(uri)
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("send");
    let status = response.status();
    (status, read_json(response.into_body()).await)
}

async fn create_request(app: &axum::Router, body: Value) -> (StatusCode, Value) {
    post_json(app, "/launch-tasks", body).await
}

#[tokio::test]
async fn create_returns_task_with_three_ordered_steps() {
    let app = router().await;
    let (status, body) = create_request(
        &app,
        json!({
            "linear_issue_id": "SUP-116",
            "planner_agent": "planner",
            "coder_agent": "coder",
            "reviewer_agent": "reviewer"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(body["task"]["linear_issue_id"], "SUP-116");
    assert_eq!(body["task"]["recipe_kind"], "plan_implement_review");
    assert_eq!(body["task"]["status"], "pending");
    let steps = body["steps"].as_array().expect("steps array");
    assert_eq!(steps.len(), 3);
    assert_eq!(steps[0]["sequence"], 1);
    assert_eq!(steps[0]["step_kind"], "plan");
    assert_eq!(steps[2]["step_kind"], "review");
}

#[tokio::test]
async fn create_with_unknown_agent_is_400() {
    let app = router().await;
    let (status, body) = create_request(
        &app,
        json!({
            "linear_issue_id": "SUP-116",
            "planner_agent": "ghost",
            "coder_agent": "coder",
            "reviewer_agent": "reviewer"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        body["error"].as_str().unwrap().contains("ghost"),
        "unexpected: {body}"
    );
}

#[tokio::test]
async fn create_with_empty_linear_issue_id_is_400() {
    let app = router().await;
    let (status, _) = create_request(
        &app,
        json!({
            "linear_issue_id": "  ",
            "planner_agent": "planner",
            "coder_agent": "coder",
            "reviewer_agent": "reviewer"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_allows_second_run_when_issue_already_has_active_run() {
    let (app, run_repo) = router_with_run_repo().await;
    // Seed a non-terminal run for the issue: create must NOT hard-block. The
    // operator decides whether to launch a second run (the UI warns instead);
    // runs are run-id-scoped, so they don't collide.
    let run = Run::new(
        "SUP-66".into(),
        "SUP-66".into(),
        "owner/repo".into(),
        TriggerSource::Manual,
        ExecutionMode::FullAuto,
        "main".into(),
        true,
        None,
    );
    run_repo.insert(&run).await.expect("seed active run");

    let (status, body) = create_request(
        &app,
        json!({
            "linear_issue_id": "SUP-66",
            "planner_agent": "planner",
            "coder_agent": "coder",
            "reviewer_agent": "reviewer"
        }),
    )
    .await;

    assert_eq!(status, StatusCode::CREATED, "unexpected body: {body}");

    // The launch task is created despite the pre-existing active run.
    let (_, list) = get_json(&app, "/launch-tasks?linear_issue_id=SUP-66").await;
    assert_eq!(
        list.as_array().unwrap().len(),
        1,
        "launch task should be created even with an active run: {list}"
    );
}

#[tokio::test]
async fn create_succeeds_when_issue_has_no_active_run() {
    // Guard is wired but must not block when there is no active run.
    let (app, _run_repo) = router_with_run_repo().await;
    let (status, _body) = create_request(
        &app,
        json!({
            "linear_issue_id": "SUP-66",
            "planner_agent": "planner",
            "coder_agent": "coder",
            "reviewer_agent": "reviewer"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
}

#[tokio::test]
async fn get_returns_task_and_steps_endpoint_returns_three_steps() {
    let app = router().await;
    let (_, created) = create_request(
        &app,
        json!({
            "linear_issue_id": "SUP-116",
            "planner_agent": "planner",
            "coder_agent": "coder",
            "reviewer_agent": "reviewer"
        }),
    )
    .await;
    let id = created["task"]["id"].as_str().unwrap().to_string();

    let (status, body) = get_json(&app, &format!("/launch-tasks/{id}")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["id"], id);
    assert_eq!(body["status"], "pending");

    let (status, steps) = get_json(&app, &format!("/launch-tasks/{id}/steps")).await;
    assert_eq!(status, StatusCode::OK);
    let arr = steps.as_array().unwrap();
    assert_eq!(arr.len(), 3);
    // Steps must come back ordered by sequence.
    assert_eq!(arr[0]["sequence"], 1);
    assert_eq!(arr[1]["sequence"], 2);
    assert_eq!(arr[2]["sequence"], 3);
}

#[tokio::test]
async fn get_unknown_id_is_404() {
    let app = router().await;
    let unknown = uuid::Uuid::new_v4();
    let (status, _) = get_json(&app, &format!("/launch-tasks/{unknown}")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = get_json(&app, &format!("/launch-tasks/{unknown}/steps")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn list_filters_by_linear_issue_id_and_status() {
    let app = router().await;
    let (_, _) = create_request(
        &app,
        json!({
            "linear_issue_id": "SUP-1",
            "planner_agent": "planner",
            "coder_agent": "coder",
            "reviewer_agent": "reviewer"
        }),
    )
    .await;
    let (_, _) = create_request(
        &app,
        json!({
            "linear_issue_id": "SUP-2",
            "planner_agent": "planner",
            "coder_agent": "coder",
            "reviewer_agent": "reviewer"
        }),
    )
    .await;

    // No filter — both come back.
    let (_, body) = get_json(&app, "/launch-tasks").await;
    assert_eq!(body.as_array().unwrap().len(), 2);

    // linear_issue_id filter narrows to the matching task.
    let (_, body) = get_json(&app, "/launch-tasks?linear_issue_id=SUP-2").await;
    let arr = body.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["linear_issue_id"], "SUP-2");

    // status=pending matches both (newly created tasks start pending).
    let (_, body) = get_json(&app, "/launch-tasks?status=pending").await;
    assert_eq!(body.as_array().unwrap().len(), 2);

    // Combined filter that does not match returns empty.
    let (_, body) = get_json(&app, "/launch-tasks?status=running&linear_issue_id=SUP-1").await;
    assert!(body.as_array().unwrap().is_empty());
}

// ── SUP-120 retry endpoint ────────────────────────────────────────────

/// Helper — POST a fresh task and seed it into `NeedsHuman` with a single
/// `NeedsHuman` step pinned as `current_step_id`. The task ends up in the
/// shape the operator-facing retry button targets.
async fn seed_needs_human_task(app: &axum::Router, repo: &SqliteLaunchTaskRepo) -> LaunchTaskId {
    let (_, created) = create_request(
        app,
        json!({
            "linear_issue_id": "SUP-120",
            "planner_agent": "planner",
            "coder_agent": "coder",
            "reviewer_agent": "reviewer"
        }),
    )
    .await;
    let task_id_str = created["task"]["id"].as_str().unwrap();
    let task_id = LaunchTaskId(uuid::Uuid::parse_str(task_id_str).unwrap());
    let steps = repo.list_steps(task_id).await.unwrap();
    let plan_step = steps
        .iter()
        .find(|s| s.sequence == 1)
        .expect("plan step exists");
    repo.update_task_status(task_id, LaunchTaskStatus::Running)
        .await
        .unwrap();
    repo.update_step_status(plan_step.id, LaunchTaskStepStatus::Running)
        .await
        .unwrap();
    repo.update_step_status(plan_step.id, LaunchTaskStepStatus::NeedsHuman)
        .await
        .unwrap();
    repo.update_task_status(task_id, LaunchTaskStatus::NeedsHuman)
        .await
        .unwrap();
    repo.set_current_step(task_id, Some(plan_step.id))
        .await
        .unwrap();
    task_id
}

#[tokio::test]
async fn retry_returns_200_when_task_is_needs_human() {
    let (app, repo) = router_with_repo().await;
    let task_id = seed_needs_human_task(&app, &repo).await;

    let (status, body) = post_no_body(&app, &format!("/launch-tasks/{}/retry", task_id.0)).await;
    assert_eq!(status, StatusCode::OK, "body: {body}");
    assert_eq!(body["task_id"], task_id.0.to_string());
    // The router uses `StubStepRunner`, which always Completes the step. The
    // retry drives the rest of the recipe to Completed.
    assert_eq!(body["status"], "completed", "body: {body}");
    assert!(body["step_id"].is_string());
}

/// SUP-203 — a retry regenerates the derived `RunContextSnapshot` before
/// re-running the parked step. The snapshot stays derived: one row per launch
/// task (PK), versioned, replaced wholesale — never canonical. Also exercises
/// the `?path=fresh` discriminator deserialization.
#[tokio::test]
async fn retry_regenerates_the_run_context_snapshot() {
    let (app, repo, _, _, pool) = test_app().await;
    let task_id = seed_needs_human_task(&app, &repo).await;

    let snapshot_repo = SqliteRunContextSnapshotRepo::new(pool.clone());
    assert!(
        snapshot_repo
            .get_by_launch_task(task_id)
            .await
            .unwrap()
            .is_none(),
        "no snapshot cached before the first retry"
    );

    let (status, body) = post_no_body(
        &app,
        &format!("/launch-tasks/{}/retry?path=fresh", task_id.0),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body: {body}");

    let snapshot = snapshot_repo
        .get_by_launch_task(task_id)
        .await
        .unwrap()
        .expect("retry regenerates the derived run context snapshot");
    assert_eq!(snapshot.launch_task_id, task_id);
    assert_eq!(
        snapshot.version, RUN_CONTEXT_SNAPSHOT_VERSION,
        "regenerated snapshot is the current derived projection version"
    );
}

#[tokio::test]
async fn retry_returns_409_when_task_is_not_needs_human() {
    let (app, repo) = router_with_repo().await;
    let (_, created) = create_request(
        &app,
        json!({
            "linear_issue_id": "SUP-120",
            "planner_agent": "planner",
            "coder_agent": "coder",
            "reviewer_agent": "reviewer"
        }),
    )
    .await;
    let task_id =
        LaunchTaskId(uuid::Uuid::parse_str(created["task"]["id"].as_str().unwrap()).unwrap());
    repo.update_task_status(task_id, LaunchTaskStatus::Failed)
        .await
        .unwrap();

    let (status, body) = post_no_body(&app, &format!("/launch-tasks/{}/retry", task_id.0)).await;
    assert_eq!(status, StatusCode::CONFLICT, "body: {body}");
    assert!(
        body["error"]
            .as_str()
            .unwrap()
            .contains("invalid launch task transition"),
        "expected 409 message, got {body}"
    );
}

#[tokio::test]
async fn retry_on_unknown_task_returns_404() {
    let (app, _) = router_with_repo().await;
    let unknown = uuid::Uuid::new_v4();
    let (status, _) = post_no_body(&app, &format!("/launch-tasks/{unknown}/retry")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

/// Verifies the `CoreError → AppError` mapping renders every transition-refusal
/// variant as 409 Conflict — the mapping is exhaustive (no catch-all), so a
/// state-machine rejection never leaks as a 500. Covers the run-state machine
/// (`InvalidTransition`), the launch-task aggregate/step, the handoff aggregate,
/// keeping the execution loop's error surface consistent.
#[tokio::test]
async fn invalid_transitions_map_to_409() {
    let response = superkick_api::tests_only::map_core_error(CoreError::InvalidTransition {
        from: RunState::Completed,
        to: RunState::Preparing,
    })
    .into_response();
    assert_eq!(response.status(), StatusCode::CONFLICT);

    let response =
        superkick_api::tests_only::map_core_error(CoreError::InvalidLaunchTaskTransition {
            from: LaunchTaskStatus::Pending,
            to: LaunchTaskStatus::Completed,
        })
        .into_response();
    assert_eq!(response.status(), StatusCode::CONFLICT);

    let response =
        superkick_api::tests_only::map_core_error(CoreError::InvalidLaunchTaskStepTransition {
            from: LaunchTaskStepStatus::Pending,
            to: LaunchTaskStepStatus::Completed,
        })
        .into_response();
    assert_eq!(response.status(), StatusCode::CONFLICT);

    let response = superkick_api::tests_only::map_core_error(CoreError::InvalidHandoffTransition {
        from: HandoffStatus::Pending,
        to: HandoffStatus::Completed,
    })
    .into_response();
    assert_eq!(response.status(), StatusCode::CONFLICT);
}

// ── SUP-154 operator intervention channel ─────────────────────────────

async fn create_intervention_request(
    app: &axum::Router,
    task_id: &str,
    body: Value,
) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/launch-tasks/{task_id}/interventions"))
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .expect("request"),
        )
        .await
        .expect("send");
    let status = response.status();
    (status, read_json(response.into_body()).await)
}

#[tokio::test]
async fn create_intervention_persists_and_returns_201() {
    let (app, _, interventions) = router_with_intervention_repo().await;
    let (_, created) = create_request(
        &app,
        json!({
            "linear_issue_id": "SUP-154",
            "planner_agent": "planner",
            "coder_agent": "coder",
            "reviewer_agent": "reviewer"
        }),
    )
    .await;
    let task_id = created["task"]["id"].as_str().unwrap();

    let (status, body) = create_intervention_request(
        &app,
        task_id,
        json!({ "body": "  watch the failing tests  " }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "body: {body}");
    assert_eq!(body["body"], "watch the failing tests", "trim applied");
    assert_eq!(body["author"], "operator", "default author");
    assert!(body["consumed_at"].is_null(), "pending");

    // Persisted via the dedicated GET.
    let (status, list) = get_json(&app, &format!("/launch-tasks/{task_id}/interventions")).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list.as_array().unwrap().len(), 1);

    // And reachable via the repo directly.
    let task_uuid = uuid::Uuid::parse_str(task_id).unwrap();
    let rows = interventions
        .list_by_task(superkick_core::LaunchTaskId(task_uuid))
        .await
        .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].body, "watch the failing tests");
}

#[tokio::test]
async fn create_intervention_with_empty_body_is_400() {
    let app = router().await;
    let (_, created) = create_request(
        &app,
        json!({
            "linear_issue_id": "SUP-154",
            "planner_agent": "planner",
            "coder_agent": "coder",
            "reviewer_agent": "reviewer"
        }),
    )
    .await;
    let task_id = created["task"]["id"].as_str().unwrap();
    let (status, _) = create_intervention_request(&app, task_id, json!({ "body": "   " })).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn create_intervention_on_unknown_task_is_404() {
    let app = router().await;
    let unknown = uuid::Uuid::new_v4();
    let (status, _) =
        create_intervention_request(&app, &unknown.to_string(), json!({ "body": "hello" })).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn list_interventions_on_unknown_task_is_404() {
    let app = router().await;
    let unknown = uuid::Uuid::new_v4();
    let (status, _) = get_json(&app, &format!("/launch-tasks/{unknown}/interventions")).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn list_interventions_returns_chronological_order() {
    let app = router().await;
    let (_, created) = create_request(
        &app,
        json!({
            "linear_issue_id": "SUP-154",
            "planner_agent": "planner",
            "coder_agent": "coder",
            "reviewer_agent": "reviewer"
        }),
    )
    .await;
    let task_id = created["task"]["id"].as_str().unwrap();
    let _ = create_intervention_request(&app, task_id, json!({ "body": "first" })).await;
    let _ = create_intervention_request(&app, task_id, json!({ "body": "second" })).await;
    let _ = create_intervention_request(&app, task_id, json!({ "body": "third" })).await;

    let (status, list) = get_json(&app, &format!("/launch-tasks/{task_id}/interventions")).await;
    assert_eq!(status, StatusCode::OK);
    let arr = list.as_array().unwrap();
    assert_eq!(arr.len(), 3);
    assert_eq!(arr[0]["body"], "first");
    assert_eq!(arr[1]["body"], "second");
    assert_eq!(arr[2]["body"], "third");
}

// ── Storage layer round-trip — mark_consumed semantics ────────────────

#[tokio::test]
async fn intervention_repo_lists_pending_for_step_and_marks_consumed() {
    use chrono::Utc;

    let (app, repo, interventions) = router_with_intervention_repo().await;
    let (_, created) = create_request(
        &app,
        json!({
            "linear_issue_id": "SUP-154",
            "planner_agent": "planner",
            "coder_agent": "coder",
            "reviewer_agent": "reviewer"
        }),
    )
    .await;
    let task_uuid = uuid::Uuid::parse_str(created["task"]["id"].as_str().unwrap()).unwrap();
    let task_id = superkick_core::LaunchTaskId(task_uuid);
    let steps = repo.list_steps(task_id).await.unwrap();
    let plan_step = &steps[0];
    let implement_step = &steps[1];

    // One intervention targeting no specific step (applies to next), one
    // targeted at the implement step. The plan step should only see the
    // null-target one.
    let untargeted =
        superkick_core::LaunchTaskIntervention::new(task_id, None, None, "any step".into())
            .unwrap();
    let targeted = superkick_core::LaunchTaskIntervention::new(
        task_id,
        Some(implement_step.id),
        None,
        "implement only".into(),
    )
    .unwrap();
    interventions.insert(&untargeted).await.unwrap();
    interventions.insert(&targeted).await.unwrap();

    let pending_plan = interventions
        .list_pending_for_step(task_id, plan_step.id)
        .await
        .unwrap();
    assert_eq!(pending_plan.len(), 1);
    assert_eq!(pending_plan[0].body, "any step");

    let pending_impl = interventions
        .list_pending_for_step(task_id, implement_step.id)
        .await
        .unwrap();
    assert_eq!(pending_impl.len(), 2);

    // Mark only the untargeted one consumed.
    let now = Utc::now();
    let updated = interventions
        .mark_consumed(&[untargeted.id], now)
        .await
        .unwrap();
    assert_eq!(updated, vec![untargeted.id]);

    // A second mark_consumed for the same id is a no-op (returns empty).
    let updated_again = interventions
        .mark_consumed(&[untargeted.id], now)
        .await
        .unwrap();
    assert!(updated_again.is_empty());

    // The targeted-implement one is still pending for the implement step.
    let pending_impl = interventions
        .list_pending_for_step(task_id, implement_step.id)
        .await
        .unwrap();
    assert_eq!(pending_impl.len(), 1);
    assert_eq!(pending_impl[0].body, "implement only");
}
