//! HTTP smoke tests for the Linear write paths. Mounts a fresh
//! `linear_writes_test_router` with a stub `LinearWriter` and pins the
//! legacy `PATCH { state, team_id }` body so the kanban drag flow keeps
//! working after the contract widening.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::http::{Request, StatusCode};
use chrono::Utc;
use http_body_util::BodyExt;
use serde_json::{Value, json};
use superkick_api::linear_writes_test_router;
use superkick_api::test_handlers::{LinearFuture, LinearWriter};
use superkick_integrations::linear::{
    IssueAssignee, IssueComment, IssueCreateInput, IssueDetailResponse, IssuePriority, IssueStatus,
    IssueUpdateInput, LinearError, LinearOptions,
};
use tower::ServiceExt;

#[derive(Debug, Default)]
struct StubCalls {
    create_inputs: Vec<IssueCreateInput>,
    update_inputs: Vec<(String, IssueUpdateInput)>,
    comment_calls: Vec<(String, String)>,
    list_options_calls: u32,
    resolve_state_calls: Vec<(Option<String>, String, Option<String>)>,
}

#[derive(Default)]
enum StubOutcome {
    #[default]
    Ok,
    Reject(String),
}

#[derive(Default)]
struct StubLinearWriter {
    calls: Mutex<StubCalls>,
    detail: Mutex<Option<IssueDetailResponse>>,
    comment: Mutex<Option<IssueComment>>,
    options: Mutex<Option<LinearOptions>>,
    resolved_state_id: Mutex<Option<String>>,
    outcome: Mutex<StubOutcome>,
}

impl StubLinearWriter {
    fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    fn with_detail(self: Arc<Self>, detail: IssueDetailResponse) -> Arc<Self> {
        *self.detail.lock().expect("detail mutex") = Some(detail);
        self
    }

    fn with_comment(self: Arc<Self>, comment: IssueComment) -> Arc<Self> {
        *self.comment.lock().expect("comment mutex") = Some(comment);
        self
    }

    fn with_options(self: Arc<Self>, options: LinearOptions) -> Arc<Self> {
        *self.options.lock().expect("options mutex") = Some(options);
        self
    }

    fn with_resolved_state_id(self: Arc<Self>, state_id: impl Into<String>) -> Arc<Self> {
        *self.resolved_state_id.lock().expect("resolved state mutex") = Some(state_id.into());
        self
    }

    fn rejecting(self: Arc<Self>, message: impl Into<String>) -> Arc<Self> {
        *self.outcome.lock().expect("outcome mutex") = StubOutcome::Reject(message.into());
        self
    }

    fn current_outcome(&self) -> Result<(), LinearError> {
        match &*self.outcome.lock().expect("outcome mutex") {
            StubOutcome::Ok => Ok(()),
            StubOutcome::Reject(msg) => Err(LinearError::Rejected(msg.clone())),
        }
    }
}

impl LinearWriter for StubLinearWriter {
    fn create_issue<'a>(
        &'a self,
        input: IssueCreateInput,
    ) -> LinearFuture<'a, IssueDetailResponse> {
        Box::pin(async move {
            self.calls
                .lock()
                .expect("calls mutex")
                .create_inputs
                .push(input);
            self.current_outcome()?;
            Ok(self
                .detail
                .lock()
                .expect("detail mutex")
                .clone()
                .expect("StubLinearWriter::with_detail must be called"))
        })
    }

    fn update_issue<'a>(
        &'a self,
        id: &'a str,
        input: IssueUpdateInput,
    ) -> LinearFuture<'a, IssueDetailResponse> {
        Box::pin(async move {
            self.calls
                .lock()
                .expect("calls mutex")
                .update_inputs
                .push((id.to_string(), input));
            self.current_outcome()?;
            Ok(self
                .detail
                .lock()
                .expect("detail mutex")
                .clone()
                .expect("StubLinearWriter::with_detail must be called"))
        })
    }

    fn create_comment<'a>(
        &'a self,
        issue_id: &'a str,
        body: &'a str,
    ) -> LinearFuture<'a, IssueComment> {
        Box::pin(async move {
            self.calls
                .lock()
                .expect("calls mutex")
                .comment_calls
                .push((issue_id.to_string(), body.to_string()));
            self.current_outcome()?;
            Ok(self
                .comment
                .lock()
                .expect("comment mutex")
                .clone()
                .expect("StubLinearWriter::with_comment must be called"))
        })
    }

    fn list_options<'a>(&'a self) -> LinearFuture<'a, LinearOptions> {
        Box::pin(async move {
            self.calls.lock().expect("calls mutex").list_options_calls += 1;
            self.current_outcome()?;
            Ok(self
                .options
                .lock()
                .expect("options mutex")
                .clone()
                .expect("StubLinearWriter::with_options must be called"))
        })
    }

    fn resolve_workflow_state_for_type<'a>(
        &'a self,
        team_id: Option<&'a str>,
        target_type: &'a str,
        issue_id_for_lookup: Option<&'a str>,
    ) -> LinearFuture<'a, String> {
        Box::pin(async move {
            self.calls
                .lock()
                .expect("calls mutex")
                .resolve_state_calls
                .push((
                    team_id.map(str::to_string),
                    target_type.to_string(),
                    issue_id_for_lookup.map(str::to_string),
                ));
            self.current_outcome()?;
            Ok(self
                .resolved_state_id
                .lock()
                .expect("resolved state mutex")
                .clone()
                .unwrap_or_else(|| "stub-state-id".to_string()))
        })
    }
}

fn sample_detail() -> IssueDetailResponse {
    IssueDetailResponse {
        id: "11111111-1111-1111-1111-111111111111".into(),
        identifier: "SUP-99".into(),
        title: "Sample".into(),
        status: IssueStatus {
            state_type: "started".into(),
            name: "In Progress".into(),
            color: "#fc0".into(),
        },
        priority: IssuePriority {
            value: 2,
            label: "High".into(),
        },
        url: "https://linear.app/t/SUP-99".into(),
        created_at: Utc::now(),
        updated_at: Utc::now(),
        description: String::new(),
        labels: Vec::new(),
        assignee: None,
        project: None,
        cycle: None,
        estimate: None,
        due_date: None,
        parent: None,
        children: Vec::new(),
        blocked_by: Vec::new(),
        comments: Vec::new(),
        linked_runs: Vec::new(),
    }
}

fn sample_comment() -> IssueComment {
    IssueComment {
        id: "comment-1".into(),
        body: "Reproduced on Safari".into(),
        author: Some(IssueAssignee {
            id: "u-1".into(),
            name: "Alice".into(),
            avatar_url: None,
        }),
        created_at: Utc::now(),
        updated_at: Utc::now(),
        parent_id: None,
    }
}

fn sample_options() -> LinearOptions {
    let mut workflow_states_by_team = HashMap::new();
    workflow_states_by_team.insert("team-1".to_string(), Vec::new());
    LinearOptions {
        teams: Vec::new(),
        users: Vec::new(),
        projects: Vec::new(),
        labels: Vec::new(),
        workflow_states_by_team,
    }
}

async fn json_body(body: Body) -> Value {
    let bytes = body.collect().await.expect("collect").to_bytes();
    serde_json::from_slice(&bytes).expect("json body")
}

async fn send(
    router: &axum::Router,
    method: &str,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, axum::http::HeaderMap, Value) {
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
    (status, headers, json_body(res.into_body()).await)
}

#[tokio::test]
async fn post_issues_returns_201_and_location_header_with_detail_body() {
    let writer = StubLinearWriter::new().with_detail(sample_detail());
    let router = linear_writes_test_router(Some(Arc::clone(&writer) as Arc<dyn LinearWriter>));

    let payload = json!({
        "team_id": "team-1",
        "title": "Fix Safari login",
        "priority": 2,
    });
    let (status, headers, body) = send(&router, "POST", "/issues", Some(payload)).await;

    assert_eq!(status, StatusCode::CREATED, "body = {body}");
    assert_eq!(body["identifier"], "SUP-99");
    let location = headers
        .get("Location")
        .expect("Location header")
        .to_str()
        .expect("ascii");
    assert!(
        location.ends_with("/11111111-1111-1111-1111-111111111111"),
        "{location}"
    );

    let calls = writer.calls.lock().expect("calls");
    assert_eq!(calls.create_inputs.len(), 1);
    assert_eq!(calls.create_inputs[0].team_id, "team-1");
    assert_eq!(calls.create_inputs[0].title, "Fix Safari login");
    assert_eq!(calls.create_inputs[0].priority, Some(2));
}

#[tokio::test]
async fn post_issues_rejects_empty_title_with_400() {
    let writer = StubLinearWriter::new().with_detail(sample_detail());
    let router = linear_writes_test_router(Some(Arc::clone(&writer) as Arc<dyn LinearWriter>));
    let (status, _, body) = send(
        &router,
        "POST",
        "/issues",
        Some(json!({ "team_id": "t-1", "title": "   " })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let msg = body["error"].as_str().expect("error");
    assert!(msg.contains("title"));
    assert!(writer.calls.lock().expect("calls").create_inputs.is_empty());
}

#[tokio::test]
async fn patch_issues_returns_200_with_detail_body_on_legacy_state_change() {
    let writer = StubLinearWriter::new()
        .with_detail(sample_detail())
        .with_resolved_state_id("state-uuid-1");
    let router = linear_writes_test_router(Some(Arc::clone(&writer) as Arc<dyn LinearWriter>));

    let payload = json!({ "state": "in_progress", "team_id": "team-1" });
    let (status, _, body) = send(&router, "PATCH", "/issues/issue-x", Some(payload)).await;

    assert_eq!(status, StatusCode::OK, "body = {body}");
    assert_eq!(body["identifier"], "SUP-99");

    let calls = writer.calls.lock().expect("calls");
    assert_eq!(calls.resolve_state_calls.len(), 1);
    let (team_id, target_type, fallback_issue) = &calls.resolve_state_calls[0];
    assert_eq!(team_id.as_deref(), Some("team-1"));
    assert_eq!(target_type, "started");
    assert_eq!(fallback_issue.as_deref(), Some("issue-x"));
    assert_eq!(calls.update_inputs.len(), 1);
    let (id, input) = &calls.update_inputs[0];
    assert_eq!(id, "issue-x");
    assert_eq!(input.state_id.as_deref(), Some("state-uuid-1"));
}

#[tokio::test]
async fn patch_issues_applies_assignee_null_when_explicit_null() {
    let writer = StubLinearWriter::new().with_detail(sample_detail());
    let router = linear_writes_test_router(Some(Arc::clone(&writer) as Arc<dyn LinearWriter>));
    let (status, _, _) = send(
        &router,
        "PATCH",
        "/issues/issue-x",
        Some(json!({ "assignee_id": null })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let calls = writer.calls.lock().expect("calls");
    let (_, input) = &calls.update_inputs[0];
    assert_eq!(input.assignee_id, Some(None));
    assert!(input.project_id.is_none());
}

#[tokio::test]
async fn patch_issues_skips_assignee_when_absent() {
    let writer = StubLinearWriter::new().with_detail(sample_detail());
    let router = linear_writes_test_router(Some(Arc::clone(&writer) as Arc<dyn LinearWriter>));
    let (status, _, _) = send(
        &router,
        "PATCH",
        "/issues/issue-x",
        Some(json!({ "title": "New title" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let calls = writer.calls.lock().expect("calls");
    let (_, input) = &calls.update_inputs[0];
    assert_eq!(input.assignee_id, None);
    assert_eq!(input.title.as_deref(), Some("New title"));
}

#[tokio::test]
async fn patch_issues_rejects_state_and_state_id_together() {
    let writer = StubLinearWriter::new().with_detail(sample_detail());
    let router = linear_writes_test_router(Some(Arc::clone(&writer) as Arc<dyn LinearWriter>));
    let (status, _, body) = send(
        &router,
        "PATCH",
        "/issues/issue-x",
        Some(json!({ "state": "in_progress", "state_id": "s-1" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let msg = body["error"].as_str().expect("error");
    assert!(msg.contains("state"));
}

#[tokio::test]
async fn post_comments_returns_201_with_comment_body() {
    let writer = StubLinearWriter::new().with_comment(sample_comment());
    let router = linear_writes_test_router(Some(Arc::clone(&writer) as Arc<dyn LinearWriter>));
    let (status, _, body) = send(
        &router,
        "POST",
        "/issues/issue-x/comments",
        Some(json!({ "body": "Reproduced on Safari" })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "body = {body}");
    assert_eq!(body["id"], "comment-1");
    assert_eq!(body["body"], "Reproduced on Safari");
    let calls = writer.calls.lock().expect("calls");
    assert_eq!(calls.comment_calls.len(), 1);
    assert_eq!(calls.comment_calls[0].0, "issue-x");
    assert_eq!(calls.comment_calls[0].1, "Reproduced on Safari");
}

#[tokio::test]
async fn post_comments_rejects_empty_body() {
    let writer = StubLinearWriter::new().with_comment(sample_comment());
    let router = linear_writes_test_router(Some(Arc::clone(&writer) as Arc<dyn LinearWriter>));
    let (status, _, body) = send(
        &router,
        "POST",
        "/issues/issue-x/comments",
        Some(json!({ "body": "   " })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().expect("error").contains("body"));
}

#[tokio::test]
async fn get_linear_options_returns_aggregated_payload() {
    let writer = StubLinearWriter::new().with_options(sample_options());
    let router = linear_writes_test_router(Some(Arc::clone(&writer) as Arc<dyn LinearWriter>));
    let (status, _, body) = send(&router, "GET", "/linear/options", None).await;
    assert_eq!(status, StatusCode::OK, "body = {body}");
    assert!(body["teams"].is_array());
    assert!(body["users"].is_array());
    assert!(body["projects"].is_array());
    assert!(body["labels"].is_array());
    assert!(body["workflow_states_by_team"].is_object());
    let calls = writer.calls.lock().expect("calls");
    assert_eq!(calls.list_options_calls, 1);
}

#[tokio::test]
async fn endpoints_return_503_when_linear_unconfigured() {
    let router = linear_writes_test_router(None);
    let cases: [(&str, &str, Option<Value>); 4] = [
        (
            "POST",
            "/issues",
            Some(json!({ "team_id": "t", "title": "x" })),
        ),
        ("PATCH", "/issues/x", Some(json!({ "title": "y" }))),
        ("POST", "/issues/x/comments", Some(json!({ "body": "z" }))),
        ("GET", "/linear/options", None),
    ];
    for (method, uri, body) in cases {
        let (status, _, payload) = send(&router, method, uri, body).await;
        assert_eq!(
            status,
            StatusCode::SERVICE_UNAVAILABLE,
            "{method} {uri} body = {payload}"
        );
    }
}

#[tokio::test]
async fn endpoints_map_linear_rejected_to_422_with_message() {
    let writer = StubLinearWriter::new()
        .with_detail(sample_detail())
        .with_comment(sample_comment())
        .rejecting("Title is required");
    let router = linear_writes_test_router(Some(Arc::clone(&writer) as Arc<dyn LinearWriter>));

    for (method, uri, body) in [
        ("POST", "/issues", json!({ "team_id": "t-1", "title": "x" })),
        ("PATCH", "/issues/issue-x", json!({ "title": "y" })),
        ("POST", "/issues/issue-x/comments", json!({ "body": "z" })),
    ] {
        let (status, _, payload) = send(&router, method, uri, Some(body)).await;
        assert_eq!(
            status,
            StatusCode::UNPROCESSABLE_ENTITY,
            "{method} {uri} body = {payload}"
        );
        assert_eq!(payload["error"], "Title is required");
    }
}
