//! Shared HTTP plumbing for the integration suites. Each test binary
//! compiles this module independently, so helpers unused by one binary are
//! expected — hence the file-level allow.
#![allow(dead_code)]

use axum::Router;
use axum::body::Body;
use axum::http::{HeaderMap, Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::Value;
use tower::ServiceExt;

pub async fn read_json(body: Body) -> Value {
    let bytes = body.collect().await.expect("collect").to_bytes();
    if bytes.is_empty() {
        return Value::Null;
    }
    serde_json::from_slice(&bytes).expect("json body")
}

pub async fn send(
    router: &Router,
    method: &str,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, HeaderMap, Value) {
    let mut req = Request::builder().method(method).uri(uri);
    let body = match body {
        Some(value) => {
            req = req.header("content-type", "application/json");
            Body::from(value.to_string())
        }
        None => Body::empty(),
    };
    let res = router
        .clone()
        .oneshot(req.body(body).expect("request"))
        .await
        .expect("send");
    let status = res.status();
    let headers = res.headers().clone();
    (status, headers, read_json(res.into_body()).await)
}

pub async fn get_json(router: &Router, uri: &str) -> (StatusCode, Value) {
    let (status, _, body) = send(router, "GET", uri, None).await;
    (status, body)
}

pub async fn post_json(router: &Router, uri: &str, body: Value) -> (StatusCode, Value) {
    let (status, _, body) = send(router, "POST", uri, Some(body)).await;
    (status, body)
}

pub async fn patch_json(router: &Router, uri: &str, body: Value) -> (StatusCode, Value) {
    let (status, _, body) = send(router, "PATCH", uri, Some(body)).await;
    (status, body)
}
