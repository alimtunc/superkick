//! Per-provider model catalog.
//!
//! Serves the curated, static [`provider_models`] list so the frontend model
//! dropdown is fed server-side (a free-text "Custom…" option keeps arbitrary
//! ids working). No vendor `/v1/models` call — the CLIs expose no model list.

use axum::extract::Path;
use axum::response::Json;
use superkick_core::{AgentProvider, ModelInfo, provider_models};

use crate::error::AppError;

pub async fn list_provider_models(
    Path(provider): Path<String>,
) -> Result<Json<Vec<ModelInfo>>, AppError> {
    let provider =
        AgentProvider::from_cli_name(&provider).ok_or(AppError::NotFound("unknown provider"))?;
    Ok(Json(provider_models(provider)))
}
