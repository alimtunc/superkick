//! Launch-profile composition service.
//!
//! Owns the business logic of turning a launch profile (optionally edited in the
//! composer) into an immutable [`ProfileSnapshot`] and persisting a dynamic
//! launch task. Kept out of `superkick-api` per the module-boundary rule — the
//! HTTP handler validates input and maps [`LaunchCompositionError`] onto
//! `AppError`, while this service owns profile resolution + persistence.

use superkick_core::{
    CoreError, LaunchProfile, LaunchStepKind, LaunchTask, LaunchTaskOverrides, LaunchTaskStep,
    ProfileSnapshot, ProfileStep, SessionPolicyError, SkillSource, StepExecutor, StepSnapshot,
};
use superkick_storage::repo::{LaunchProfileRepo, LaunchTaskRepo, SkillDefinitionRepo};

/// Error surfaced to the HTTP edge. `superkick-api` maps each variant onto the
/// existing `AppError` shapes.
#[derive(Debug, thiserror::Error)]
pub enum LaunchCompositionError {
    #[error("launch profile '{0}' not found")]
    ProfileNotFound(String),
    #[error("launch profile '{profile}' step {ordering} ({label}): {source}")]
    IncompatibleStep {
        profile: String,
        ordering: u32,
        label: String,
        source: SessionPolicyError,
    },
    #[error(
        "launch profile '{profile}' step {ordering} ({label}): executor '{executor}' is not yet implemented"
    )]
    UnsupportedExecutor {
        profile: String,
        ordering: u32,
        label: String,
        executor: StepExecutor,
    },
    /// Empty composition (no enabled steps) or another domain rule.
    #[error(transparent)]
    Core(#[from] CoreError),
    #[error(transparent)]
    Storage(#[from] anyhow::Error),
}

/// Composes + persists dynamic launch tasks from app-managed launch profiles.
pub struct LaunchProfileService<P, S, T> {
    profiles: P,
    skills: S,
    tasks: T,
}

impl<P, S, T> LaunchProfileService<P, S, T>
where
    P: LaunchProfileRepo,
    S: SkillDefinitionRepo,
    T: LaunchTaskRepo,
{
    pub fn new(profiles: P, skills: S, tasks: T) -> Self {
        Self {
            profiles,
            skills,
            tasks,
        }
    }

    /// Resolve a profile — optionally with a composer-edited step list — into an
    /// immutable snapshot, **without persisting**. Drives both the composer
    /// preview (`POST /launch-profiles/preview`) and the launch path. Each
    /// step's [`SkillSource`] is resolved from its `skill_ref`; an unknown skill
    /// degrades to an `Installed` reference rather than failing.
    pub async fn resolve_snapshot(
        &self,
        profile_id: &str,
        steps_override: Option<Vec<ProfileStep>>,
    ) -> Result<ProfileSnapshot, LaunchCompositionError> {
        let profile: LaunchProfile = self
            .profiles
            .get(profile_id)
            .await?
            .ok_or_else(|| LaunchCompositionError::ProfileNotFound(profile_id.to_string()))?;

        let steps = steps_override.unwrap_or_else(|| profile.steps.clone());
        let mut snapshot_steps = Vec::with_capacity(steps.len());
        for step in &steps {
            step.session_policy
                .validate_with(step.executor)
                .map_err(|source| LaunchCompositionError::IncompatibleStep {
                    profile: profile.id.clone(),
                    ordering: step.ordering,
                    label: step.label.clone(),
                    source,
                })?;
            if step.enabled && step.executor.runner_mode().is_none() {
                return Err(LaunchCompositionError::UnsupportedExecutor {
                    profile: profile.id.clone(),
                    ordering: step.ordering,
                    label: step.label.clone(),
                    executor: step.executor,
                });
            }
            let skill_source = match self.skills.get(&step.skill_ref).await? {
                Some(skill) => skill.source,
                None => SkillSource::Installed(step.skill_ref.clone()),
            };
            snapshot_steps.push(StepSnapshot {
                ordering: step.ordering,
                label: step.label.clone(),
                skill_ref: step.skill_ref.clone(),
                skill_source,
                step_kind: LaunchStepKind::for_output(step.output_expectation),
                provider: step.provider,
                model: step.model.clone(),
                reasoning: step.reasoning,
                executor: step.executor,
                session_policy: step.session_policy,
                output_expectation: step.output_expectation,
                enabled: step.enabled,
            });
        }

        Ok(ProfileSnapshot {
            profile_id: profile.id,
            profile_name: profile.name,
            profile_kind: profile.kind,
            steps: snapshot_steps,
        })
    }

    /// Compose + persist a dynamic launch task in one shot. Returns the task and
    /// its step rows so the caller (the HTTP handler) can trigger execution via
    /// the existing launch-task path.
    pub async fn compose_launch_task(
        &self,
        linear_issue_id: &str,
        profile_id: &str,
        steps_override: Option<Vec<ProfileStep>>,
        overrides: LaunchTaskOverrides,
    ) -> Result<(LaunchTask, Vec<LaunchTaskStep>), LaunchCompositionError> {
        let snapshot = self.resolve_snapshot(profile_id, steps_override).await?;
        let (mut task, steps) = LaunchTask::new_dynamic(linear_issue_id, snapshot)?;
        task.apply_overrides(overrides)?;
        self.tasks.insert_with_steps(&task, &steps).await?;
        Ok((task, steps))
    }
}
