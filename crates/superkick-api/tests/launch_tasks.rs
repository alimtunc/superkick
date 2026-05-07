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

use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::response::IntoResponse;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use superkick_api::launch_task_test_router;
use superkick_core::{
    AgentCatalog, AgentProvider, CoreAgentDefinition, CoreError, LaunchTaskStatus,
    LaunchTaskStepStatus, LinearContextMode, ResolvedMcpPolicy, ResolvedToolPolicy,
};
use superkick_storage::SqliteLaunchTaskRepo;
use superkick_storage::connect;
use tower::ServiceExt;

fn agent(name: &str, provider: AgentProvider, model: Option<&str>) -> CoreAgentDefinition {
    CoreAgentDefinition {
        name: name.into(),
        provider,
        role: None,
        model: model.map(String::from),
        system_prompt: None,
        tools: None,
        timeout_secs: None,
        max_turns: None,
        linear_context: LinearContextMode::default(),
        mcp_policy: ResolvedMcpPolicy::default(),
        tool_policy: ResolvedToolPolicy::default(),
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

async fn router() -> axum::Router {
    let pool = connect("sqlite::memory:").await.expect("pool");
    let repo = Arc::new(SqliteLaunchTaskRepo::new(pool));
    launch_task_test_router(repo, Arc::new(catalog()))
}

async fn read_json(body: Body) -> Value {
    let bytes = body.collect().await.expect("collect").to_bytes();
    serde_json::from_slice(&bytes).expect("json body")
}

async fn create_request(app: &axum::Router, body: Value) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/launch-tasks")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .expect("request"),
        )
        .await
        .expect("send");
    let status = response.status();
    (status, read_json(response.into_body()).await)
}

async fn get_json(app: &axum::Router, uri: &str) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(uri)
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("send");
    let status = response.status();
    (status, read_json(response.into_body()).await)
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

/// Verifies the `CoreError → AppError` mapping for the two new variants. No
/// HTTP endpoint in SUP-116 mutates a task or step (writes are deferred to
/// SUP-118 + the storage layer is tested directly), but the mapping must
/// already render 409 so the execution loop's error surface is consistent
/// from day one.
#[tokio::test]
async fn invalid_transitions_map_to_409() {
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
}
