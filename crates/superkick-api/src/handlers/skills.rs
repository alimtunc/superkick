//! App-managed skill definitions HTTP handlers.
//!
//! Thin CRUD over `SkillDefinitionRepo`. Builtins are editable but not
//! deletable (disable them instead); custom skills are free-form.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};

use superkick_core::SkillDefinition;
use superkick_storage::repo::SkillDefinitionRepo;

use crate::AppState;
use crate::error::AppError;

const SKILL_NOT_FOUND: &str = "skill not found";

pub async fn list_skills(
    State(state): State<AppState>,
) -> Result<Json<Vec<SkillDefinition>>, AppError> {
    Ok(Json(state.skill_repo.list().await?))
}

pub async fn create_skill(
    State(state): State<AppState>,
    Json(body): Json<SkillDefinition>,
) -> Result<impl IntoResponse, AppError> {
    body.validate()?;
    if state.skill_repo.get(&body.id).await?.is_some() {
        return Err(AppError::Conflict {
            message: format!("skill '{}' already exists", body.id),
            run: None,
        });
    }
    state.skill_repo.upsert(&body).await?;
    Ok((StatusCode::CREATED, Json(body)))
}

pub async fn patch_skill(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(mut body): Json<SkillDefinition>,
) -> Result<Json<SkillDefinition>, AppError> {
    if state.skill_repo.get(&id).await?.is_none() {
        return Err(AppError::NotFound(SKILL_NOT_FOUND));
    }
    body.id = id; // path is authoritative
    body.validate()?;
    state.skill_repo.upsert(&body).await?;
    Ok(Json(body))
}

pub async fn delete_skill(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, AppError> {
    let skill = state
        .skill_repo
        .get(&id)
        .await?
        .ok_or(AppError::NotFound(SKILL_NOT_FOUND))?;
    if !skill.is_deletable() {
        return Err(AppError::BadRequest(
            "builtin skills cannot be deleted — disable them instead".into(),
        ));
    }
    state.skill_repo.delete(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}
