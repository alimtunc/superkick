//! SQLite integration tests for app-managed providers / skills /
//! profiles and dynamic launch-task snapshots. Hits a real in-memory SQLite
//! per CLAUDE.md rule 9. Covers seed defaults + idempotency, profile/skill/
//! provider CRUD, the dynamic recipe round-trip (model/reasoning/executor
//! snapshots, disabled steps), and the no-Claude-SDK-by-default invariant.

use anyhow::Result;
use superkick_core::{
    AgentProvider, BillingProfile, LaunchProfile, LaunchRecipe, LaunchStepKind, LaunchTask,
    OutputExpectation, ProfileKind, ProfileSnapshot, ReasoningEffort, SessionPolicy,
    SkillDefinition, SkillKind, SkillSource, StepExecutor, StepSnapshot,
};
use superkick_storage::repo::{
    LaunchProfileRepo, LaunchTaskRepo, ProviderSettingsRepo, SkillDefinitionRepo,
};
use superkick_storage::{
    SqliteLaunchProfileRepo, SqliteLaunchTaskRepo, SqliteProviderSettingsRepo,
    SqliteSkillDefinitionRepo, connect, seed_defaults,
};

use sqlx::SqlitePool;

async fn pool() -> Result<SqlitePool> {
    connect("sqlite::memory:").await
}

fn dynamic_snapshot() -> ProfileSnapshot {
    ProfileSnapshot {
        profile_id: "standard".into(),
        profile_name: "Standard".into(),
        profile_kind: ProfileKind::Standard,
        steps: vec![
            StepSnapshot {
                ordering: 1,
                label: "Plan".into(),
                skill_ref: "plan".into(),
                skill_source: SkillSource::Installed("plan".into()),
                step_kind: LaunchStepKind::Plan,
                provider: AgentProvider::Codex,
                model: None,
                reasoning: ReasoningEffort::High,
                executor: StepExecutor::CodexStructured,
                session_policy: SessionPolicy::Fresh,
                output_expectation: OutputExpectation::Plan,
                enabled: true,
            },
            StepSnapshot {
                ordering: 2,
                label: "Implement".into(),
                skill_ref: "implement".into(),
                skill_source: SkillSource::Prompt("apply the diff".into()),
                step_kind: LaunchStepKind::Implement,
                provider: AgentProvider::Codex,
                model: Some("gpt-5-codex".into()),
                reasoning: ReasoningEffort::Medium,
                executor: StepExecutor::CodexStructured,
                session_policy: SessionPolicy::Fresh,
                output_expectation: OutputExpectation::Patch,
                enabled: true,
            },
            StepSnapshot {
                ordering: 3,
                label: "Review".into(),
                skill_ref: "review".into(),
                skill_source: SkillSource::Installed("review".into()),
                step_kind: LaunchStepKind::Review,
                provider: AgentProvider::Codex,
                model: None,
                reasoning: ReasoningEffort::Low,
                executor: StepExecutor::CodexStructured,
                session_policy: SessionPolicy::Fresh,
                output_expectation: OutputExpectation::Review,
                enabled: false,
            },
        ],
    }
}

#[tokio::test]
async fn seed_defaults_writes_builtin_providers_skills_profiles() -> Result<()> {
    let pool = pool().await?;
    let providers = SqliteProviderSettingsRepo::new(pool.clone());
    let skills = SqliteSkillDefinitionRepo::new(pool.clone());
    let profiles = SqliteLaunchProfileRepo::new(pool.clone());

    assert_eq!(providers.list().await?.len(), 2);
    assert_eq!(
        skills.list().await?.len(),
        SkillDefinition::builtins().len()
    );
    assert_eq!(
        profiles.list().await?.len(),
        LaunchProfile::builtins().len()
    );

    let standard = profiles.get("standard").await?.expect("standard profile");
    assert!(standard.is_default);
    assert_eq!(standard.kind, ProfileKind::Standard);
    let refs: Vec<_> = standard
        .steps
        .iter()
        .map(|s| s.skill_ref.as_str())
        .collect();
    assert_eq!(refs, ["plan", "implement", "review"]);
    Ok(())
}

#[tokio::test]
async fn claude_provider_default_is_not_the_paid_sdk_path() -> Result<()> {
    let pool = pool().await?;
    let providers = SqliteProviderSettingsRepo::new(pool.clone());
    let claude = providers
        .get(AgentProvider::Claude)
        .await?
        .expect("claude settings");
    assert_eq!(claude.default_executor, StepExecutor::InteractivePty);
    assert!(!claude.default_executor.is_paid_sdk());
    assert_eq!(claude.billing_mode, BillingProfile::Subscription);
    Ok(())
}

#[tokio::test]
async fn seeding_is_idempotent_and_preserves_operator_edits() -> Result<()> {
    let pool = pool().await?;
    let profiles = SqliteLaunchProfileRepo::new(pool.clone());

    let mut standard = profiles.get("standard").await?.expect("standard");
    standard.name = "My Standard".into();
    standard.steps.truncate(1);
    profiles.upsert(&standard).await?;

    // A second boot re-runs seeding; edits must survive and counts stay fixed.
    seed_defaults(&pool).await?;

    assert_eq!(
        profiles.list().await?.len(),
        LaunchProfile::builtins().len()
    );
    let reloaded = profiles.get("standard").await?.expect("standard");
    assert_eq!(reloaded.name, "My Standard");
    assert_eq!(reloaded.steps.len(), 1);
    Ok(())
}

#[tokio::test]
async fn custom_skill_and_profile_crud() -> Result<()> {
    let pool = pool().await?;
    let skills = SqliteSkillDefinitionRepo::new(pool.clone());
    let profiles = SqliteLaunchProfileRepo::new(pool.clone());

    let mut custom_skill = SkillDefinition::builtins().remove(0);
    custom_skill.id = "my_skill".into();
    custom_skill.label = "My Skill".into();
    custom_skill.kind = SkillKind::Custom;
    custom_skill.source = SkillSource::Prompt("custom instructions".into());
    skills.upsert(&custom_skill).await?;
    let fetched = skills.get("my_skill").await?.expect("custom skill");
    assert_eq!(
        fetched.source,
        SkillSource::Prompt("custom instructions".into())
    );

    skills.delete("my_skill").await?;
    assert!(skills.get("my_skill").await?.is_none());

    let mut custom = profiles.get("custom").await?.expect("custom profile");
    custom.name = "My Workflow".into();
    custom.steps = vec![standard_first_step()];
    profiles.upsert(&custom).await?;
    let reloaded = profiles.get("custom").await?.expect("custom profile");
    assert_eq!(reloaded.name, "My Workflow");
    assert_eq!(reloaded.steps.len(), 1);
    Ok(())
}

fn standard_first_step() -> superkick_core::ProfileStep {
    LaunchProfile::builtins()
        .into_iter()
        .find(|p| p.kind == ProfileKind::Standard)
        .expect("standard")
        .steps
        .remove(0)
}

#[tokio::test]
async fn dynamic_task_round_trips_snapshot_and_step_fields() -> Result<()> {
    let pool = pool().await?;
    let repo = SqliteLaunchTaskRepo::new(pool.clone());

    let (task, steps) = LaunchTask::new_dynamic("SUP-194", dynamic_snapshot())?;
    repo.insert_with_steps(&task, &steps).await?;

    let reloaded = repo.get(task.id).await?.expect("task");
    assert_eq!(reloaded.recipe_kind, LaunchRecipe::Dynamic);
    assert_eq!(reloaded.profile_id.as_deref(), Some("standard"));
    let snap = reloaded.profile_snapshot.expect("snapshot");
    assert_eq!(snap.profile_kind, ProfileKind::Standard);
    assert_eq!(snap.steps.len(), 3);

    let steps = repo.list_steps(task.id).await?;
    assert_eq!(steps.len(), 3);

    // model / reasoning / executor snapshots survive the round-trip.
    assert_eq!(steps[0].label.as_deref(), Some("Plan"));
    assert_eq!(steps[0].reasoning, Some(ReasoningEffort::High));
    assert_eq!(steps[0].executor, Some(StepExecutor::CodexStructured));
    assert_eq!(steps[0].session_policy, Some(SessionPolicy::Fresh));
    assert_eq!(
        steps[0].skill_source,
        Some(SkillSource::Installed("plan".into()))
    );

    assert_eq!(steps[1].model.as_deref(), Some("gpt-5-codex"));
    assert_eq!(steps[1].reasoning, Some(ReasoningEffort::Medium));
    assert_eq!(
        steps[1].skill_source,
        Some(SkillSource::Prompt("apply the diff".into()))
    );

    // disabled step persists with enabled = false.
    assert!(!steps[2].enabled);
    assert_eq!(steps[2].output_expectation, Some(OutputExpectation::Review));
    Ok(())
}

#[tokio::test]
async fn dynamic_task_with_all_enabled_steps_round_trips() -> Result<()> {
    let pool = pool().await?;
    let repo = SqliteLaunchTaskRepo::new(pool.clone());

    let snapshot = ProfileSnapshot {
        steps: dynamic_snapshot()
            .steps
            .into_iter()
            .map(|mut s| {
                s.enabled = true;
                s
            })
            .collect(),
        ..dynamic_snapshot()
    };
    let (task, steps) = LaunchTask::new_dynamic("SUP-194-b", snapshot)?;
    repo.insert_with_steps(&task, &steps).await?;

    let steps = repo.list_steps(task.id).await?;
    assert!(steps.iter().all(|s| s.enabled));
    Ok(())
}

#[tokio::test]
async fn provider_settings_upsert_overwrites() -> Result<()> {
    let pool = pool().await?;
    let providers = SqliteProviderSettingsRepo::new(pool.clone());

    let mut codex = providers
        .get(AgentProvider::Codex)
        .await?
        .expect("codex settings");
    codex.default_model = Some("gpt-5-codex".into());
    codex.default_reasoning = ReasoningEffort::High;
    providers.upsert(&codex).await?;

    let reloaded = providers
        .get(AgentProvider::Codex)
        .await?
        .expect("codex settings");
    assert_eq!(reloaded.default_model.as_deref(), Some("gpt-5-codex"));
    assert_eq!(reloaded.default_reasoning, ReasoningEffort::High);
    // still exactly two provider rows (upsert, not insert).
    assert_eq!(providers.list().await?.len(), 2);
    Ok(())
}
