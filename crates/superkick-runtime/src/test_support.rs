//! In-crate test helpers, shared between `tests/launch_task_executor.rs`,
//! `tests/launch_task_real_step_runner.rs`, and `tests/release_validation.rs`
//! (SUP-137).
//!
//! Marked `#[doc(hidden)]` at the crate root — these are not part of the
//! stable public API. They live in the library so that all integration tests
//! (which link the library as a normal dependency) share one canonical
//! definition rather than each maintaining its own copy.

use std::collections::HashMap;
use std::time::Duration;

use superkick_core::{
    AgentCatalog, AgentOrigin, AgentProvider, CoreAgentDefinition, LinearContextMode,
    PlanImplementReviewAgents, ResolvedMcpPolicy, ResolvedToolPolicy,
};
use tokio::sync::broadcast;

use crate::launch_task_event_bus::LaunchTaskEvent;

/// Build a minimal [`CoreAgentDefinition`] with the supplied name, provider,
/// and optional model. Everything else (system prompt, tools, MCP policy)
/// defaults to the empty/permissive value. Plenty for tests that only need
/// the role/provider pair to flow through `LaunchTask::new_with_v1_recipe`.
pub fn agent(name: &str, provider: AgentProvider, model: Option<&str>) -> CoreAgentDefinition {
    CoreAgentDefinition {
        name: name.into(),
        provider,
        role: None,
        model: model.map(String::from),
        system_prompt: None,
        timeout_secs: None,
        max_turns: None,
        origin: AgentOrigin::Custom,
        linear_context: LinearContextMode::default(),
        mcp_policy: ResolvedMcpPolicy::default(),
        tool_policy: ResolvedToolPolicy::default(),
        backend: None,
        runner_mode: None,
        billing_profile: None,
    }
}

/// Default three-role catalog (`planner` + `coder` on Claude, `reviewer` on
/// Codex). Mirrors the shape `examples/superkick.yaml` ships, so executor and
/// runner tests see the same role wiring production does.
pub fn catalog() -> AgentCatalog {
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

/// Role tuple matching the [`catalog`] above. Use with
/// `LaunchTask::new_with_v1_recipe`.
pub fn agents() -> PlanImplementReviewAgents {
    PlanImplementReviewAgents {
        planner: "planner".into(),
        coder: "coder".into(),
        reviewer: "reviewer".into(),
    }
}

/// Drain every event currently waiting on the bus into a Vec. Polls until the
/// receiver has nothing left, with a tight per-recv timeout so tests never
/// hang on an unexpected silence.
pub async fn drain_events(rx: &mut broadcast::Receiver<LaunchTaskEvent>) -> Vec<LaunchTaskEvent> {
    let mut out = Vec::new();
    while let Ok(Ok(event)) = tokio::time::timeout(Duration::from_millis(50), rx.recv()).await {
        out.push(event);
    }
    out
}
