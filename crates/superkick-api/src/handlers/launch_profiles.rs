//! Launch profile HTTP handlers.
//!
//! CRUD is thin over `LaunchProfileRepo`; `preview` delegates the resolution
//! business logic to `LaunchProfileService` (runtime) per the module boundary.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::Deserialize;

use superkick_core::{LaunchProfile, ProfileSnapshot, ProfileStep};
use superkick_storage::repo::LaunchProfileRepo;

use crate::AppState;
use crate::error::AppError;

const PROFILE_NOT_FOUND: &str = "launch profile not found";

pub async fn list_profiles(
    State(state): State<AppState>,
) -> Result<Json<Vec<LaunchProfile>>, AppError> {
    Ok(Json(state.launch_profile_repo.list().await?))
}

pub async fn get_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<LaunchProfile>, AppError> {
    let profile = state
        .launch_profile_repo
        .get(&id)
        .await?
        .ok_or(AppError::NotFound(PROFILE_NOT_FOUND))?;
    Ok(Json(profile))
}

pub async fn create_profile(
    State(state): State<AppState>,
    Json(body): Json<LaunchProfile>,
) -> Result<impl IntoResponse, AppError> {
    body.validate()?;
    if state.launch_profile_repo.get(&body.id).await?.is_some() {
        return Err(AppError::Conflict {
            message: format!("launch profile '{}' already exists", body.id),
            run: None,
        });
    }
    state.launch_profile_repo.upsert(&body).await?;
    Ok((StatusCode::CREATED, Json(body)))
}

pub async fn patch_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(mut body): Json<LaunchProfile>,
) -> Result<Json<LaunchProfile>, AppError> {
    if state.launch_profile_repo.get(&id).await?.is_none() {
        return Err(AppError::NotFound(PROFILE_NOT_FOUND));
    }
    body.id = id; // path is authoritative
    body.validate()?;
    state.launch_profile_repo.upsert(&body).await?;
    Ok(Json(body))
}

pub async fn delete_profile(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let profile = state
        .launch_profile_repo
        .get(&id)
        .await?
        .ok_or(AppError::NotFound(PROFILE_NOT_FOUND))?;
    if !profile.is_deletable() {
        return Err(AppError::BadRequest(
            "builtin launch profiles cannot be deleted".into(),
        ));
    }
    state.launch_profile_repo.delete(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct PreviewProfileRequest {
    pub profile_id: String,
    #[serde(default)]
    pub step_overrides: Option<Vec<ProfileStep>>,
}

/// Resolve a profile (plus any composer edits) into an immutable snapshot
/// without persisting — feeds the Launch Composer preview.
pub async fn preview_profile(
    State(state): State<AppState>,
    Json(body): Json<PreviewProfileRequest>,
) -> Result<Json<ProfileSnapshot>, AppError> {
    let snapshot = state
        .launch_profile_service
        .resolve_snapshot(&body.profile_id, body.step_overrides)
        .await?;
    Ok(Json(snapshot))
}
