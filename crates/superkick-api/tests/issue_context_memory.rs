//! SUP-148 HTTP smoke tests for the issue-context + memory endpoints.
//!
//! The suite drives the three routes through a freshly-built
//! `issue_context_test_router` backed by a real in-memory SQLite. The
//! `IssueLookup` is a tiny stub -- no network. Pins:
//!   - get-or-create on first call materialises a snapshot; the second call
//!     returns the same `linear_issue_id`/`identifier` (and does not insert a
//!     duplicate row);
//!   - POST `/memory` returns the persisted entry with id + timestamp;
//!   - each documented credential pattern yields 422 with the kind in the
//!     error body;
//!   - newest-first pagination over `limit + 1` rows produces a next cursor
//!     that drains the rest cleanly;
//!   - POST `/memory` auto-creates the workspace when none exists.

use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::http::{Request, StatusCode};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use superkick_api::issue_context_test_router;
use superkick_api::test_handlers::{IssueLookup, IssueWorkspaceContextRepoDyn, MemoryEntryRepoDyn};
use superkick_core::{IssueWorkspaceContext, IssueWorkspaceContextSnapshot};
use superkick_integrations::linear::LinearError;
use superkick_storage::repo::IssueWorkspaceContextRepo;
use superkick_storage::{SqliteIssueWorkspaceContextRepo, SqliteMemoryEntryRepo, connect};
use tower::ServiceExt;

const TEST_ISSUE_ID: &str = "11111111-1111-1111-1111-111111111111";
const TEST_IDENTIFIER: &str = "SUP-148";

/// Canned-snapshot lookup. Returns the same payload for every id and records
/// the calls so tests can assert the count.
struct StubLookup {
    snapshot: IssueWorkspaceContextSnapshot,
    calls: Mutex<u32>,
}

impl StubLookup {
    fn new(snapshot: IssueWorkspaceContextSnapshot) -> Arc<Self> {
        Arc::new(Self {
            snapshot,
            calls: Mutex::new(0),
        })
    }

    fn call_count(&self) -> u32 {
        *self.calls.lock().expect("lookup mutex")
    }
}

impl IssueLookup for StubLookup {
    fn lookup<'a>(
        &'a self,
        _id: &'a str,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<Output = Result<IssueWorkspaceContextSnapshot, LinearError>>
                + Send
                + 'a,
        >,
    > {
        Box::pin(async move {
            *self.calls.lock().expect("lookup mutex") += 1;
            Ok(self.snapshot.clone())
        })
    }
}

fn sample_snapshot() -> IssueWorkspaceContextSnapshot {
    IssueWorkspaceContextSnapshot {
        linear_team_key: "SUP".into(),
        linear_issue_identifier: TEST_IDENTIFIER.into(),
        linear_issue_id: TEST_ISSUE_ID.into(),
        snapshot_title: "Memory ledger".into(),
        snapshot_body_md: "Body".into(),
        snapshot_status_name: "In Progress".into(),
    }
}

struct Harness {
    router: axum::Router,
    context_repo: Arc<SqliteIssueWorkspaceContextRepo>,
    lookup: Arc<StubLookup>,
}

async fn harness() -> Harness {
    let pool = connect("sqlite::memory:").await.expect("pool");
    let context_repo = Arc::new(SqliteIssueWorkspaceContextRepo::new(pool.clone()));
    let memory_repo = Arc::new(SqliteMemoryEntryRepo::new(pool));
    let lookup = StubLookup::new(sample_snapshot());

    let context_dyn: Arc<dyn IssueWorkspaceContextRepoDyn> = Arc::clone(&context_repo) as _;
    let memory_dyn: Arc<dyn MemoryEntryRepoDyn> = memory_repo as _;
    let router = issue_context_test_router(
        context_dyn,
        memory_dyn,
        Some(Arc::clone(&lookup) as Arc<dyn IssueLookup>),
    );
    Harness {
        router,
        context_repo,
        lookup,
    }
}

async fn json_body(body: Body) -> Value {
    let bytes = body.collect().await.expect("collect").to_bytes();
    serde_json::from_slice(&bytes).expect("json body")
}

async fn get(router: &axum::Router, uri: &str) -> (StatusCode, Value) {
    let res = router
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(uri)
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("send");
    let status = res.status();
    (status, json_body(res.into_body()).await)
}

/// Convenience: query the underlying SqliteIssueWorkspaceContextRepo through
/// the concrete trait. The handler dyn-shim re-exposes the same method name
/// so we disambiguate here once instead of at every call site.
async fn list_contexts(h: &Harness) -> Vec<IssueWorkspaceContext> {
    IssueWorkspaceContextRepo::list_by_issue_identifier(&*h.context_repo, TEST_IDENTIFIER)
        .await
        .expect("list")
}

async fn post(router: &axum::Router, uri: &str, body: Value) -> (StatusCode, Value) {
    let res = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(uri)
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .expect("request"),
        )
        .await
        .expect("send");
    let status = res.status();
    (status, json_body(res.into_body()).await)
}

#[tokio::test]
async fn get_context_creates_aggregate_on_first_call() {
    let h = harness().await;
    let uri = format!("/issues/{TEST_IDENTIFIER}/context");

    let (s1, v1) = get(&h.router, &uri).await;
    assert_eq!(s1, StatusCode::OK);
    assert_eq!(v1["snapshot"]["id"], TEST_ISSUE_ID);
    assert_eq!(v1["snapshot"]["identifier"], TEST_IDENTIFIER);
    assert_eq!(v1["snapshot"]["status_name"], "In Progress");
    assert!(v1["comment_excerpts"].as_array().expect("array").is_empty());
    assert!(v1["linked_items"].as_array().expect("array").is_empty());

    let rows_after_first = list_contexts(&h).await;
    assert_eq!(rows_after_first.len(), 1);

    let (s2, v2) = get(&h.router, &uri).await;
    assert_eq!(s2, StatusCode::OK);
    assert_eq!(v2["snapshot"]["id"], TEST_ISSUE_ID);

    let rows_after_second = list_contexts(&h).await;
    assert_eq!(rows_after_second.len(), 1);
    assert_eq!(rows_after_first[0].id.0, rows_after_second[0].id.0);
    // Snapshot is frozen-at-attach -- the second GET must be served from the
    // DB without hitting Linear again.
    assert_eq!(h.lookup.call_count(), 1);
}

#[tokio::test]
async fn post_memory_persists_and_returns_entry_with_id_and_timestamp() {
    let h = harness().await;
    let uri = format!("/issues/{TEST_IDENTIFIER}/context/memory");

    let payload = json!({ "role": "decision", "author": "claude", "text": "Chose option A" });
    let (status, body) = post(&h.router, &uri, payload).await;
    assert_eq!(status, StatusCode::OK, "body = {body}");
    assert!(body["id"].is_string());
    assert_eq!(body["role"], "decision");
    assert_eq!(body["author"], "claude");
    assert_eq!(body["text"], "Chose option A");
    assert!(body["created_at"].is_string());

    let (_s, page) = get(&h.router, &uri).await;
    let entries = page["entries"].as_array().expect("entries array");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0]["id"], body["id"]);
}

#[tokio::test]
async fn post_memory_rejects_each_credential_pattern_with_422() {
    let h = harness().await;
    let uri = format!("/issues/{TEST_IDENTIFIER}/context/memory");

    let cases = [
        (
            "bearer_token",
            "Authorization: Bearer abcdef0123456789ghijklmn",
        ),
        ("aws_access_key", "leaked AKIAIOSFODNN7EXAMPLE"),
        ("openai_api_key", "use sk-proj-AbCdEfGhIjKlMnOpQrStUv now"),
        (
            "basic_auth_url",
            "clone https://user:hunter2@example.com/repo.git",
        ),
        (
            "github_pat",
            "token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
        ),
    ];
    for (expected_kind, text) in cases {
        let (status, body) = post(&h.router, &uri, json!({ "role": "note", "text": text })).await;
        assert_eq!(
            status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "pattern {expected_kind}: body = {body}"
        );
        let msg = body["error"].as_str().expect("error string");
        assert!(
            msg.contains(expected_kind),
            "expected kind {expected_kind} in {msg}"
        );
    }
}

#[tokio::test]
async fn get_memory_paginates_newest_first() {
    let h = harness().await;
    let uri_get = format!("/issues/{TEST_IDENTIFIER}/context/memory?limit=50");
    // Materialise a context first so all 75 entries share the same parent.
    let (_, _) = get(&h.router, &format!("/issues/{TEST_IDENTIFIER}/context")).await;

    for i in 0..75 {
        let payload = json!({
            "role": "note",
            "text": format!("entry {i}"),
        });
        let (s, _) = post(
            &h.router,
            &format!("/issues/{TEST_IDENTIFIER}/context/memory"),
            payload,
        )
        .await;
        assert_eq!(s, StatusCode::OK);
        // Bump timestamps apart so the cursor compare is unambiguous.
        tokio::time::sleep(std::time::Duration::from_millis(2)).await;
    }

    let (s, page1) = get(&h.router, &uri_get).await;
    assert_eq!(s, StatusCode::OK);
    let entries1 = page1["entries"].as_array().expect("entries");
    assert_eq!(entries1.len(), 50);
    let cursor = page1["next_cursor"]
        .as_str()
        .expect("next_cursor present")
        .to_string();

    let (s2, page2) = get(
        &h.router,
        &format!("/issues/{TEST_IDENTIFIER}/context/memory?limit=50&cursor={cursor}"),
    )
    .await;
    assert_eq!(s2, StatusCode::OK);
    let entries2 = page2["entries"].as_array().expect("entries");
    assert_eq!(entries2.len(), 25);
    assert!(page2["next_cursor"].is_null());

    // Newest-first invariant: the first entry of page 1 carries the highest
    // `created_at` of all 75 rows.
    let first_text = entries1[0]["text"].as_str().expect("text");
    assert_eq!(first_text, "entry 74");
}

#[tokio::test]
async fn post_memory_auto_creates_context_if_missing() {
    let h = harness().await;
    let uri = format!("/issues/{TEST_IDENTIFIER}/context/memory");

    assert!(list_contexts(&h).await.is_empty());

    let (status, body) = post(
        &h.router,
        &uri,
        json!({ "role": "note", "text": "first message" }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "body = {body}");

    assert_eq!(list_contexts(&h).await.len(), 1);
}
