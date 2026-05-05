//! SUP-102 — orchestrator session HTTP smoke tests.
//!
//! Drives the route handlers via `tower::ServiceExt::oneshot` against a real
//! in-memory SQLite (per CLAUDE.md rule 9 — never mock the storage layer).
//! Pins:
//! - happy-path create → patch → checkpoint → detail returns the checkpoint;
//! - invalid status transitions return 409 with a structured error body;
//! - empty payload validation returns 400.

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use superkick_api::orchestrator_session_test_router;
use superkick_storage::SqliteOrchestratorSessionRepo;
use superkick_storage::connect;
use tower::ServiceExt;

async fn router() -> axum::Router {
    let pool = connect("sqlite::memory:").await.expect("pool");
    let repo = Arc::new(SqliteOrchestratorSessionRepo::new(pool));
    orchestrator_session_test_router(repo)
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
                .uri("/orchestrator-sessions")
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
async fn create_then_get_returns_session_with_no_checkpoint() {
    let app = router().await;
    let (status, body) = create_request(
        &app,
        json!({
            "title": "drive epic",
            "provider": "claude",
            "owner": "alice",
            "scope": { "linear_issue_ids": ["SUP-95"] }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let id = body["id"].as_str().expect("id field").to_string();
    assert_eq!(body["status"], "idle");

    let response = app
        .oneshot(
            Request::builder()
                .uri(format!("/orchestrator-sessions/{id}"))
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("send");
    assert_eq!(response.status(), StatusCode::OK);
    let detail = read_json(response.into_body()).await;
    assert_eq!(detail["session"]["id"], id);
    assert_eq!(detail["session"]["scope"]["linear_issue_ids"][0], "SUP-95");
    assert!(detail["latest_checkpoint"].is_null());
}

#[tokio::test]
async fn empty_title_is_400() {
    let app = router().await;
    let (status, body) = create_request(
        &app,
        json!({
            "title": "   ",
            "provider": "claude",
            "owner": "alice",
            "scope": {}
        }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().contains("title"));
}

#[tokio::test]
async fn empty_owner_is_400() {
    let app = router().await;
    let (status, _body) = create_request(
        &app,
        json!({
            "title": "ok",
            "provider": "claude",
            "owner": "",
            "scope": {}
        }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn patch_to_invalid_transition_is_409() {
    let app = router().await;
    let (_, created) = create_request(
        &app,
        json!({
            "title": "drive epic",
            "provider": "claude",
            "owner": "alice",
            "scope": { "linear_issue_ids": ["SUP-95"] }
        }),
    )
    .await;
    let id = created["id"].as_str().unwrap().to_string();

    // Idle -> Completed is allowed (terminal). Then Completed -> Idle is the
    // hard "no" — terminal states have no outgoing edges.
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/orchestrator-sessions/{id}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({ "status": "completed" }).to_string()))
                .expect("request"),
        )
        .await
        .expect("send");
    assert_eq!(response.status(), StatusCode::OK);

    let response = app
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/orchestrator-sessions/{id}"))
                .header("content-type", "application/json")
                .body(Body::from(json!({ "status": "idle" }).to_string()))
                .expect("request"),
        )
        .await
        .expect("send");
    assert_eq!(response.status(), StatusCode::CONFLICT);
    let body = read_json(response.into_body()).await;
    assert!(
        body["error"]
            .as_str()
            .unwrap()
            .contains("invalid orchestrator session transition"),
        "unexpected error body: {body}"
    );
}

#[tokio::test]
async fn checkpoint_then_get_session_returns_latest_checkpoint() {
    let app = router().await;
    let (_, created) = create_request(
        &app,
        json!({
            "title": "drive epic",
            "provider": "claude",
            "owner": "alice",
            "scope": { "linear_issue_ids": ["SUP-95"] }
        }),
    )
    .await;
    let id = created["id"].as_str().unwrap().to_string();

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/orchestrator-sessions/{id}/checkpoints"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "summary": "first compaction",
                        "decisions": ["picked claude"],
                        "open_questions": ["mcp policy?"]
                    })
                    .to_string(),
                ))
                .expect("request"),
        )
        .await
        .expect("send");
    assert_eq!(response.status(), StatusCode::CREATED);
    let checkpoint = read_json(response.into_body()).await;
    assert_eq!(checkpoint["summary"], "first compaction");
    let checkpoint_id = checkpoint["id"].as_str().unwrap().to_string();

    // GET /orchestrator-sessions/{id} should now embed the latest checkpoint.
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/orchestrator-sessions/{id}"))
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("send");
    let detail = read_json(response.into_body()).await;
    assert_eq!(detail["latest_checkpoint"]["id"], checkpoint_id);
    assert_eq!(detail["session"]["latest_checkpoint_id"], checkpoint_id);

    // GET /orchestrator-sessions/{id}/checkpoints returns the list.
    let response = app
        .oneshot(
            Request::builder()
                .uri(format!("/orchestrator-sessions/{id}/checkpoints"))
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("send");
    assert_eq!(response.status(), StatusCode::OK);
    let list = read_json(response.into_body()).await;
    assert_eq!(list.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn checkpoint_for_unknown_session_is_404() {
    let app = router().await;
    let unknown = uuid::Uuid::new_v4();
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/orchestrator-sessions/{unknown}/checkpoints"))
                .header("content-type", "application/json")
                .body(Body::from(json!({ "summary": "x" }).to_string()))
                .expect("request"),
        )
        .await
        .expect("send");
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
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

async fn patch_request(app: &axum::Router, id: &str, body: Value) -> (StatusCode, Value) {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PATCH")
                .uri(format!("/orchestrator-sessions/{id}"))
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
async fn list_filters_by_status_and_issue_identifier() {
    let app = router().await;

    let (_, a) = create_request(
        &app,
        json!({
            "title": "session A",
            "provider": "claude",
            "owner": "alice",
            "scope": { "linear_issue_ids": ["SUP-95"] },
        }),
    )
    .await;
    let (_, b) = create_request(
        &app,
        json!({
            "title": "session B",
            "provider": "codex",
            "owner": "bob",
            "scope": { "linear_issue_ids": ["SUP-300"] },
        }),
    )
    .await;
    let id_a = a["id"].as_str().unwrap().to_string();
    let id_b = b["id"].as_str().unwrap().to_string();

    // No filter — returns both.
    let (status, body) = get_json(&app, "/orchestrator-sessions").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body.as_array().unwrap().len(), 2);

    // Move B to Thinking so we can split by status.
    let (s, _) = patch_request(&app, &id_b, json!({ "status": "thinking" })).await;
    assert_eq!(s, StatusCode::OK);

    // status=idle returns only A.
    let (_, body) = get_json(&app, "/orchestrator-sessions?status=idle").await;
    let arr = body.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["id"], id_a);

    // issue_identifier=SUP-300 returns only B.
    let (_, body) = get_json(&app, "/orchestrator-sessions?issue_identifier=SUP-300").await;
    let arr = body.as_array().unwrap();
    assert_eq!(arr.len(), 1);
    assert_eq!(arr[0]["id"], id_b);

    // Combined filter matches when both predicates hold.
    let (_, body) = get_json(
        &app,
        "/orchestrator-sessions?status=thinking&issue_identifier=SUP-300",
    )
    .await;
    assert_eq!(body.as_array().unwrap().len(), 1);

    // Combined filter with mismatched status returns empty.
    let (_, body) = get_json(
        &app,
        "/orchestrator-sessions?status=idle&issue_identifier=SUP-300",
    )
    .await;
    assert!(body.as_array().unwrap().is_empty());
}

#[tokio::test]
async fn patch_scope_provider_session_id_and_cursor_persist() {
    let app = router().await;
    let (_, created) = create_request(
        &app,
        json!({
            "title": "ok",
            "provider": "claude",
            "owner": "alice",
            "scope": { "linear_issue_ids": ["SUP-95"] }
        }),
    )
    .await;
    let id = created["id"].as_str().unwrap().to_string();

    let cursor = uuid::Uuid::new_v4().to_string();
    let (status, body) = patch_request(
        &app,
        &id,
        json!({
            "scope": { "linear_issue_ids": ["SUP-95", "SUP-200"], "labels": ["epic"] },
            "provider_session_id": "claude-thread-xyz",
            "last_event_cursor": cursor,
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["scope"]["linear_issue_ids"][1], "SUP-200");
    assert_eq!(body["scope"]["labels"][0], "epic");
    assert_eq!(body["provider_session_id"], "claude-thread-xyz");
    assert_eq!(body["last_event_cursor"], cursor);
}

#[tokio::test]
async fn patch_with_empty_linear_issue_id_is_400() {
    let app = router().await;
    let (_, created) = create_request(
        &app,
        json!({
            "title": "ok",
            "provider": "claude",
            "owner": "alice",
            "scope": {}
        }),
    )
    .await;
    let id = created["id"].as_str().unwrap().to_string();

    let (status, body) = patch_request(
        &app,
        &id,
        json!({ "scope": { "linear_issue_ids": ["SUP-1", "  "] } }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        body["error"].as_str().unwrap().contains("linear_issue_ids"),
        "unexpected error body: {body}"
    );
}

#[tokio::test]
async fn list_checkpoints_for_known_session_returns_empty_array() {
    let app = router().await;
    let (_, created) = create_request(
        &app,
        json!({
            "title": "ok",
            "provider": "claude",
            "owner": "alice",
            "scope": {}
        }),
    )
    .await;
    let id = created["id"].as_str().unwrap().to_string();

    let (status, body) = get_json(&app, &format!("/orchestrator-sessions/{id}/checkpoints")).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.as_array().unwrap().is_empty());
}
