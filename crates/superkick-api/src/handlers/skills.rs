//! App-managed skill definitions HTTP handlers.
//!
//! Thin CRUD over `SkillDefinitionRepo`. Builtins are editable but not
//! deletable (disable them instead); custom skills are free-form. Import
//! delegates the directory scan to the runtime; the handler only maps the
//! returned candidates onto `SkillDefinition` rows and persists them.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use serde::{Deserialize, Serialize};

use superkick_core::{
    AgentProvider, OutputExpectation, ProfileUsage, ReasoningEffort, SessionPolicy, SkillArtifact,
    SkillDefinition, SkillKind, SkillOrigin, SkillSource, StepExecutor,
};
use superkick_runtime::skill_import::{SkillImportCandidate, scan_import_dirs};
use superkick_storage::repo::{
    BuiltinDeletionRepo, BuiltinKind, LaunchProfileRepo, SkillDefinitionRepo,
};

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
    Json(mut body): Json<SkillDefinition>,
) -> Result<impl IntoResponse, AppError> {
    // A client must not be able to forge a builtin/imported (undeletable) origin
    // on create; only a server-side reseed produces those.
    body.origin = SkillOrigin::Custom;
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
    let existing = state
        .skill_repo
        .get(&id)
        .await?
        .ok_or(AppError::NotFound(SKILL_NOT_FOUND))?;
    body.id = id; // path is authoritative
    // origin carries the deletable/readonly semantics (is_deletable derives from
    // it); a client PATCH must never flip a builtin into deletable-custom.
    body.origin = existing.origin;
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
    state.skill_repo.delete(&id).await?;
    // Built-ins are re-seeded on boot from code constants, so a plain delete
    // would reappear; tombstone it so the operator's removal sticks for good.
    if skill.origin == SkillOrigin::Builtin {
        state
            .builtin_deletion_repo
            .record(BuiltinKind::Skill, &id)
            .await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Launch profiles whose steps reference this skill. The delete confirm dialog
/// fetches it to warn that removing the skill orphans those steps (refs are
/// FK-free and degrade at launch — this warns, it does not block).
pub async fn skill_usages(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<ProfileUsage>>, AppError> {
    Ok(Json(
        state.launch_profile_repo.profiles_using_skill(&id).await?,
    ))
}

/// Wire shape for an importable candidate. The runtime's `SkillImportCandidate`
/// is a plain scan result (no serde, carries a `PathBuf`); this DTO is the
/// serialisable boundary form the dashboard lists and posts back.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillImportCandidateDto {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub artifact_kind: SkillArtifact,
    pub body: String,
    pub source_path: String,
}

impl From<SkillImportCandidate> for SkillImportCandidateDto {
    fn from(c: SkillImportCandidate) -> Self {
        Self {
            id: c.id,
            label: c.label,
            description: c.description,
            artifact_kind: c.artifact_kind,
            body: c.body,
            source_path: c.source_path.to_string_lossy().into_owned(),
        }
    }
}

/// Candidates discovered under the configured `skills.import_dirs`. Scanning,
/// frontmatter parsing, and security guards live in the runtime; the handler
/// only forwards the boot-time dir snapshot and maps the result to the wire DTO.
pub async fn list_importable_skills(
    State(state): State<AppState>,
) -> Result<Json<Vec<SkillImportCandidateDto>>, AppError> {
    // The scan walks the operator's repo roots synchronously; offload it so a
    // large tree can't block a tokio worker thread.
    let dirs = state.skill_import_dirs.clone();
    let candidates = tokio::task::spawn_blocking(move || scan_import_dirs(&dirs))
        .await
        .map_err(|e| AppError::Internal(anyhow::Error::new(e)))?
        .into_iter()
        .map(SkillImportCandidateDto::from)
        .collect();
    Ok(Json(candidates))
}

#[derive(Deserialize)]
pub struct ImportSkillsRequest {
    pub candidates: Vec<SkillImportCandidateDto>,
}

/// Persist the operator-selected candidates as managed (`Imported`) skills.
/// The request body is fully client-controlled, so every candidate's free text
/// (label, description, body) runs through the same credential-shape scanner
/// the memory-write boundary uses; a match rejects the whole batch (422). Each
/// candidate is then validated (the inline-prompt cap does not apply to
/// file-backed bodies). An id that already names an `Imported` skill is
/// refreshed (re-import updates); a collision with a builtin or custom skill is
/// rejected with 409. The validation/conflict/redaction checks run before any
/// write, so a request
/// rejected for those reasons never persists a partial import. (A transient DB
/// error inside the write loop is not transactional and may leave a prefix.)
pub async fn import_skills(
    State(state): State<AppState>,
    Json(body): Json<ImportSkillsRequest>,
) -> Result<impl IntoResponse, AppError> {
    let mut skills = Vec::with_capacity(body.candidates.len());
    let mut seen = std::collections::HashSet::with_capacity(body.candidates.len());
    for candidate in body.candidates {
        reject_credential_like(&candidate)?;
        let skill = candidate_to_skill(candidate);
        skill.validate()?;
        if !seen.insert(skill.id.clone()) {
            return Err(AppError::BadRequest(format!(
                "duplicate skill '{}' in import request",
                skill.id
            )));
        }
        // Re-importing refreshes a previously imported skill (updated body);
        // a collision with a builtin or hand-authored custom skill is rejected
        // so import never overwrites those.
        if let Some(existing) = state.skill_repo.get(&skill.id).await? {
            if existing.origin != SkillOrigin::Imported {
                return Err(AppError::Conflict {
                    message: format!("skill '{}' already exists", skill.id),
                    run: None,
                });
            }
        }
        skills.push(skill);
    }
    for skill in &skills {
        state.skill_repo.upsert(skill).await?;
    }
    Ok((StatusCode::CREATED, Json(skills)))
}

/// Reject a candidate whose label, description, or body carries a
/// credential-shaped span, reusing the core scanner so the import path can't
/// smuggle a secret past the guard that the memory-write boundary enforces.
fn reject_credential_like(candidate: &SkillImportCandidateDto) -> Result<(), AppError> {
    let fields = [
        Some(candidate.label.as_str()),
        candidate.description.as_deref(),
        Some(candidate.body.as_str()),
    ];
    for text in fields.into_iter().flatten() {
        if let Some(kind) = superkick_core::redaction::scan(text) {
            return Err(AppError::Unprocessable(format!(
                "imported skill '{}' contains credential-like content matching pattern: {kind}",
                candidate.id
            )));
        }
    }
    Ok(())
}

fn candidate_to_skill(candidate: SkillImportCandidateDto) -> SkillDefinition {
    let SkillImportCandidateDto {
        id,
        label,
        description: _,
        artifact_kind,
        body,
        source_path: _,
    } = candidate;
    let label = if label.is_empty() { id.clone() } else { label };
    SkillDefinition {
        // The materialised file (read via `/id`) carries the instructions; the
        // source slug only points the runtime at it.
        source: SkillSource::Installed(id.clone()),
        id,
        label,
        kind: SkillKind::Custom,
        default_provider: AgentProvider::Claude,
        default_model: None,
        default_reasoning: ReasoningEffort::default(),
        // Match the executor to the provider: the bare default is CodexStructured,
        // which can't resolve a Claude step and would bypass the materialised body.
        default_executor: StepExecutor::default_for(AgentProvider::Claude),
        default_session_policy: SessionPolicy::default(),
        default_output_expectation: OutputExpectation::default(),
        enabled: true,
        origin: SkillOrigin::Imported,
        body: Some(body),
        artifact_kind,
    }
}
