//! SUP-206 V2 — `GET /providers/{provider}/models` smoke test.
//!
//! Pins that the curated per-provider model catalog is served server-side with
//! `{ id, label, is_default }` entries and that an unknown provider is a 404.

mod common;
use common::read_json;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use superkick_api::model_catalog_test_router;
use tower::ServiceExt;

#[tokio::test]
async fn returns_curated_models_for_a_known_provider() {
    let app = model_catalog_test_router();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/providers/codex/models")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("send");
    assert_eq!(response.status(), StatusCode::OK);

    let body = read_json(response.into_body()).await;
    let models = body.as_array().expect("models array");
    assert!(!models.is_empty());
    assert!(models[0]["id"].is_string());
    assert!(models[0]["label"].is_string());
    let defaults = models.iter().filter(|m| m["is_default"] == true).count();
    assert_eq!(defaults, 1, "exactly one default model");
}

#[tokio::test]
async fn unknown_provider_is_not_found() {
    let app = model_catalog_test_router();
    let response = app
        .oneshot(
            Request::builder()
                .uri("/providers/gemini/models")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("send");
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}
