//! SUP-117: agent catalog HTTP handler.
//!
//! Read-only projection of the project `AgentCatalog`. The frontend launcher
//! needs the per-step agent options without leaking internal fields
//! (`system_prompt`, `tools`, `mcp_policy`, …), so the response is a tight
//! summary rather than the full `AgentDefinition`.

use std::sync::Arc;

use axum::extract::{FromRef, State};
use axum::response::Json;
use serde::Serialize;
use superkick_core::{AgentCatalog, AgentProvider};

use crate::AppState;

/// Substate slice the agents handler reads. Mirrors the pattern used by
/// `LaunchTaskState` so the test router can build a minimal state directly.
#[derive(Clone)]
pub struct AgentsState {
    pub catalog: Arc<AgentCatalog>,
}

impl FromRef<AppState> for AgentsState {
    fn from_ref(state: &AppState) -> Self {
        Self {
            catalog: Arc::clone(&state.agent_catalog),
        }
    }
}

#[derive(Serialize)]
pub(crate) struct AgentSummary {
    pub name: String,
    pub provider: AgentProvider,
    pub role: Option<String>,
    pub model: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct ListAgentsResponse {
    pub agents: Vec<AgentSummary>,
}

pub async fn list_agents(State(state): State<AgentsState>) -> Json<ListAgentsResponse> {
    let mut agents: Vec<AgentSummary> = state
        .catalog
        .definitions()
        .map(|def| AgentSummary {
            name: def.name.clone(),
            provider: def.provider,
            role: def.role.clone(),
            model: def.model.clone(),
        })
        .collect();
    agents.sort_by(|a, b| a.name.cmp(&b.name));
    Json(ListAgentsResponse { agents })
}
