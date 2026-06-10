//! SUP-117 — `GET /agents` smoke test.
//!
//! Drives the projection of the project `AgentCatalog` to JSON. Pins:
//!   - the response wraps the list in `{ "agents": [...] }`;
//!   - each entry exposes `name`, `provider`, `role`, `model` and nothing
//!     else the launcher UI needs;
//!   - results come back sorted by name so the dashboard rendering order is
//!     deterministic regardless of HashMap iteration.

use std::collections::HashMap;
use std::sync::Arc;

mod common;
use common::read_json;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use superkick_api::agents_test_router;
use superkick_core::{
    AgentCatalog, AgentOrigin, AgentProvider, CoreAgentDefinition, LinearContextMode,
    ResolvedMcpPolicy, ResolvedToolPolicy,
};
use tower::ServiceExt;

fn agent(
    name: &str,
    provider: AgentProvider,
    role: Option<&str>,
    model: Option<&str>,
) -> CoreAgentDefinition {
    agent_with_origin(name, provider, role, model, AgentOrigin::Custom)
}

fn agent_with_origin(
    name: &str,
    provider: AgentProvider,
    role: Option<&str>,
    model: Option<&str>,
    origin: AgentOrigin,
) -> CoreAgentDefinition {
    CoreAgentDefinition {
        name: name.into(),
        provider,
        role: role.map(String::from),
        model: model.map(String::from),
        system_prompt: None,
        timeout_secs: None,
        max_turns: None,
        origin,
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
        agent(
            "planner",
            AgentProvider::Claude,
            Some("planner"),
            Some("claude-opus-4-7"),
        ),
    );
    roles.insert(
        "coder".into(),
        agent("coder", AgentProvider::Claude, Some("coder"), None),
    );
    roles.insert(
        "reviewer".into(),
        agent("reviewer", AgentProvider::Codex, Some("reviewer"), None),
    );
    AgentCatalog::new(roles)
}

#[tokio::test]
async fn list_returns_catalog_projection_sorted_by_name() {
    let app = agents_test_router(Arc::new(catalog()));
    let response = app
        .oneshot(
            Request::builder()
                .uri("/agents")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("send");
    assert_eq!(response.status(), StatusCode::OK);

    let body = read_json(response.into_body()).await;
    let agents = body["agents"].as_array().expect("agents array");
    assert_eq!(agents.len(), 3);
    // Sorted by name: coder, planner, reviewer.
    assert_eq!(agents[0]["name"], "coder");
    assert_eq!(agents[1]["name"], "planner");
    assert_eq!(agents[2]["name"], "reviewer");

    // Field shape is the launcher contract — name/provider/role/model only.
    assert_eq!(agents[1]["provider"], "claude");
    assert_eq!(agents[1]["role"], "planner");
    assert_eq!(agents[1]["model"], "claude-opus-4-7");
    assert!(agents[2]["model"].is_null());
    // Pin the lowercase serialization for the `Codex` provider variant too —
    // both arms of the `AgentProvider` union must round-trip the wire format.
    assert_eq!(agents[2]["provider"], "codex");

    assert_eq!(agents[0]["runner_mode"], "interactive_pty");
    assert_eq!(agents[0]["billing_profile"], "subscription");
    assert_eq!(agents[1]["runner_mode"], "interactive_pty");
    assert_eq!(agents[1]["billing_profile"], "subscription");
    assert_eq!(agents[2]["runner_mode"], "exec_json");
    assert_eq!(agents[2]["billing_profile"], "subscription");
}

#[tokio::test]
async fn list_returns_empty_array_when_catalog_is_empty() {
    let app = agents_test_router(Arc::new(AgentCatalog::default()));
    let response = app
        .oneshot(
            Request::builder()
                .uri("/agents")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("send");
    assert_eq!(response.status(), StatusCode::OK);
    let body = read_json(response.into_body()).await;
    assert!(body["agents"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn list_exposes_origin_so_picker_can_distinguish_builtin_from_custom() {
    // SUP-160: the picker groups built-ins separately from custom overrides;
    // that grouping is impossible without `origin` on the HTTP projection.
    let mut roles: HashMap<String, CoreAgentDefinition> = HashMap::new();
    roles.insert(
        "codex-plan".into(),
        agent_with_origin(
            "codex-plan",
            AgentProvider::Codex,
            Some("planner"),
            None,
            AgentOrigin::Builtin,
        ),
    );
    roles.insert(
        "team-coder".into(),
        agent_with_origin(
            "team-coder",
            AgentProvider::Claude,
            Some("coder"),
            None,
            AgentOrigin::Custom,
        ),
    );
    let app = agents_test_router(Arc::new(AgentCatalog::new(roles)));
    let response = app
        .oneshot(
            Request::builder()
                .uri("/agents")
                .body(Body::empty())
                .expect("request"),
        )
        .await
        .expect("send");
    let body = read_json(response.into_body()).await;
    let agents = body["agents"].as_array().expect("agents array");
    assert_eq!(agents.len(), 2);
    // Sorted by name: codex-plan, team-coder.
    assert_eq!(agents[0]["name"], "codex-plan");
    assert_eq!(agents[0]["origin"], "builtin");
    assert_eq!(agents[1]["name"], "team-coder");
    assert_eq!(agents[1]["origin"], "custom");
}
