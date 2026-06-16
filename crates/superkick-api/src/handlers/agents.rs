//! SUP-117: agent catalog HTTP handler.
//!
//! Read-only projection of the project `AgentCatalog`. The frontend launcher
//! needs the per-step agent options without leaking internal fields
//! (`system_prompt`, `tools`, `mcp_policy`, …), so the response is a tight
//! summary rather than the full `AgentDefinition`.

use axum::extract::{FromRef, Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::Serialize;
use superkick_core::{
    AgentAvatar, AgentOrigin, AgentProvider, BillingProfile, CoreAgentDefinition, ReasoningEffort,
    RunnerMode, StepExecutor,
};
use superkick_runtime::AgentCatalogProvider;

use crate::AppState;
use crate::error::AppError;

/// Substate slice the agents handler reads. Mirrors the pattern used by
/// `LaunchTaskState` so the test router can build a minimal state directly.
#[derive(Clone)]
pub struct AgentsState {
    pub catalog: AgentCatalogProvider,
}

impl FromRef<AppState> for AgentsState {
    fn from_ref(state: &AppState) -> Self {
        Self {
            catalog: state.agent_catalog.clone(),
        }
    }
}

/// Roster/picker projection. Hides the editable internals (`system_prompt`,
/// mcp/tool policy, backend) — those load per-agent via `get_agent`. `executor`
/// is the product-label derivation of `runner_mode` the roster renders.
#[derive(Serialize)]
pub(crate) struct AgentSummary {
    pub name: String,
    pub provider: AgentProvider,
    pub role: Option<String>,
    pub model: Option<String>,
    pub runner_mode: RunnerMode,
    pub executor: StepExecutor,
    pub default_reasoning: ReasoningEffort,
    pub billing_profile: BillingProfile,
    /// `builtin` for Superkick-shipped defaults, `custom` for operator-authored
    /// agents. The roster groups built-ins separately and protects them from
    /// deletion.
    pub origin: AgentOrigin,
    pub enabled: bool,
    /// Identity badge (emoji/icon + color) the roster renders; `None` falls back
    /// to a derived initial.
    pub avatar: Option<AgentAvatar>,
    /// One-line description shown as the roster hint.
    pub description: Option<String>,
}

impl AgentSummary {
    fn from_definition(def: &CoreAgentDefinition) -> Self {
        let runner_mode = def
            .runner_mode
            .unwrap_or_else(|| RunnerMode::default_for(def.provider));
        let billing_profile =
            BillingProfile::resolve(def.provider, runner_mode, def.billing_profile);
        Self {
            name: def.name.clone(),
            provider: def.provider,
            role: def.role.clone(),
            model: def.model.clone(),
            runner_mode,
            executor: StepExecutor::from_runner_mode(runner_mode),
            default_reasoning: def.default_reasoning,
            billing_profile,
            origin: def.origin,
            enabled: def.enabled,
            avatar: def.avatar.clone(),
            description: def.description.clone(),
        }
    }
}

#[derive(Serialize)]
pub(crate) struct ListAgentsResponse {
    pub agents: Vec<AgentSummary>,
}

pub async fn list_agents(
    State(state): State<AgentsState>,
) -> Result<Json<ListAgentsResponse>, AppError> {
    let catalog = state.catalog.snapshot();
    let mut agents: Vec<AgentSummary> = catalog
        .definitions()
        .map(AgentSummary::from_definition)
        .collect();
    agents.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Json(ListAgentsResponse { agents }))
}

/// Full editable agent (identity + provider/model/reasoning/runner_mode +
/// system_prompt + mcp/tool policy + backend). Powers the cockpit/editor; the
/// shape is the core [`CoreAgentDefinition`], mirroring how `/skills/{id}`
/// returns the full `SkillDefinition`.
pub async fn get_agent(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<CoreAgentDefinition>, AppError> {
    let agent = state.agent_service.get(&name).await?;
    Ok(Json(agent))
}

pub async fn create_agent(
    State(state): State<AppState>,
    Json(body): Json<CoreAgentDefinition>,
) -> Result<impl IntoResponse, AppError> {
    let agent = state.agent_service.create(body).await?;
    Ok((StatusCode::CREATED, Json(agent)))
}

pub async fn patch_agent(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Json(body): Json<CoreAgentDefinition>,
) -> Result<Json<CoreAgentDefinition>, AppError> {
    let agent = state.agent_service.update(name, body).await?;
    Ok(Json(agent))
}

pub async fn delete_agent(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<StatusCode, AppError> {
    state.agent_service.delete(&name).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Reset a built-in agent to its shipped defaults, discarding operator edits.
/// Only built-ins can be restored; a custom or unknown name is a 404.
pub async fn restore_agent(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<CoreAgentDefinition>, AppError> {
    let agent = state.agent_service.restore_default(&name).await?;
    Ok(Json(agent))
}
