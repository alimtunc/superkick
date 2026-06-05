//! App-managed provider settings HTTP handlers.
//!
//! Thin: read/replace the editable provider configuration in SQLite. The
//! detection-derived availability/install/auth fields are not probed here yet
//! (they read back as `unknown`, which the UI degrades gracefully) — live
//! detection overlay is a follow-up.

use axum::extract::{Path, State};
use axum::response::Json;

use superkick_core::{
    AgentProvider, AuthState, InstallState, ProviderAvailability, ProviderSettings,
};
use superkick_storage::repo::ProviderSettingsRepo;

use crate::AppState;
use crate::error::AppError;

pub async fn list_provider_settings(
    State(state): State<AppState>,
) -> Result<Json<Vec<ProviderSettings>>, AppError> {
    let settings = state.provider_settings_repo.list().await?;
    Ok(Json(settings))
}

/// Replace the editable fields for `{provider}`. The path is authoritative for
/// the provider id; the body supplies billing mode, default model/reasoning/
/// executor, and sandbox/permission posture. The detection-derived
/// availability / install / auth fields are not operator-writable — they are
/// reset to `Unknown` so a PATCH can never persist a fabricated runtime state.
pub async fn patch_provider_settings(
    State(state): State<AppState>,
    Path(provider): Path<String>,
    Json(mut body): Json<ProviderSettings>,
) -> Result<Json<ProviderSettings>, AppError> {
    let provider =
        AgentProvider::from_cli_name(&provider).ok_or(AppError::NotFound("unknown provider"))?;
    body.provider = provider;
    body.availability = ProviderAvailability::default();
    body.install_state = InstallState::default();
    body.auth_state = AuthState::default();
    state.provider_settings_repo.upsert(&body).await?;
    Ok(Json(body))
}
