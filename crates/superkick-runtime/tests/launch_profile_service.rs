//! `LaunchProfileService` composition tests. Hits a real in-memory
//! SQLite (seeded with the builtin profiles/skills) per CLAUDE.md rule 9.

use anyhow::Result;
use superkick_core::{
    LaunchRecipe, LaunchTaskOverrides, ProfileKind, SkillKind, SkillSource, StepExecutor,
};
use superkick_runtime::LaunchProfileService;
use superkick_runtime::launch_profile_service::LaunchCompositionError;
use superkick_storage::repo::{LaunchProfileRepo, LaunchTaskRepo};
use superkick_storage::{
    SqliteLaunchProfileRepo, SqliteLaunchTaskRepo, SqliteSkillDefinitionRepo, connect,
};

#[tokio::test]
async fn resolve_snapshot_reads_the_builtin_profile() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let svc = LaunchProfileService::new(
        SqliteLaunchProfileRepo::new(pool.clone()),
        SqliteSkillDefinitionRepo::new(pool.clone()),
        SqliteLaunchTaskRepo::new(pool.clone()),
    );
    let snapshot = svc.resolve_snapshot("standard", None).await?;
    assert_eq!(snapshot.profile_kind, ProfileKind::Standard);
    let refs: Vec<_> = snapshot
        .steps
        .iter()
        .map(|s| s.skill_ref.as_str())
        .collect();
    assert_eq!(refs, ["plan", "implement", "review"]);
    assert!(snapshot.steps.iter().all(|s| s.enabled));
    let kinds: Vec<_> = snapshot.steps.iter().map(|s| s.skill_kind).collect();
    assert_eq!(
        kinds,
        [
            Some(SkillKind::Plan),
            Some(SkillKind::Implement),
            Some(SkillKind::Review)
        ]
    );
    Ok(())
}

#[tokio::test]
async fn resolve_snapshot_degrades_unknown_skill_ref_without_a_kind() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let svc = LaunchProfileService::new(
        SqliteLaunchProfileRepo::new(pool.clone()),
        SqliteSkillDefinitionRepo::new(pool.clone()),
        SqliteLaunchTaskRepo::new(pool.clone()),
    );
    let profiles = SqliteLaunchProfileRepo::new(pool.clone());

    let mut steps = profiles.get("standard").await?.expect("standard").steps;
    steps[0].skill_ref = "typo".into();

    let snapshot = svc.resolve_snapshot("standard", Some(steps)).await?;
    assert_eq!(
        snapshot.steps[0].skill_source,
        SkillSource::Installed("typo".into())
    );
    assert_eq!(snapshot.steps[0].skill_kind, None);
    Ok(())
}

#[tokio::test]
async fn compose_launch_task_persists_a_dynamic_task() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let svc = LaunchProfileService::new(
        SqliteLaunchProfileRepo::new(pool.clone()),
        SqliteSkillDefinitionRepo::new(pool.clone()),
        SqliteLaunchTaskRepo::new(pool.clone()),
    );
    let tasks = SqliteLaunchTaskRepo::new(pool.clone());

    let (task, steps) = svc
        .compose_launch_task("SUP-194", "fast_fix", None, LaunchTaskOverrides::default())
        .await?;
    assert_eq!(task.recipe_kind, LaunchRecipe::Dynamic);
    assert_eq!(task.profile_id.as_deref(), Some("fast_fix"));
    assert_eq!(steps.len(), 2);

    let reloaded = tasks.get(task.id).await?.expect("task persisted");
    assert_eq!(reloaded.recipe_kind, LaunchRecipe::Dynamic);
    let snap = reloaded.profile_snapshot.expect("snapshot persisted");
    assert_eq!(snap.profile_kind, ProfileKind::FastFix);
    Ok(())
}

#[tokio::test]
async fn resolve_snapshot_honours_step_overrides() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let svc = LaunchProfileService::new(
        SqliteLaunchProfileRepo::new(pool.clone()),
        SqliteSkillDefinitionRepo::new(pool.clone()),
        SqliteLaunchTaskRepo::new(pool.clone()),
    );
    let profiles = SqliteLaunchProfileRepo::new(pool.clone());

    let mut steps = profiles.get("standard").await?.expect("standard").steps;
    steps[1].enabled = false; // composer disables the implement step

    let snapshot = svc.resolve_snapshot("standard", Some(steps)).await?;
    assert_eq!(snapshot.steps.len(), 3);
    assert!(snapshot.steps[0].enabled);
    assert!(!snapshot.steps[1].enabled);
    Ok(())
}

#[tokio::test]
async fn unknown_profile_is_a_not_found_error() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let svc = LaunchProfileService::new(
        SqliteLaunchProfileRepo::new(pool.clone()),
        SqliteSkillDefinitionRepo::new(pool.clone()),
        SqliteLaunchTaskRepo::new(pool.clone()),
    );
    let err = svc
        .resolve_snapshot("does_not_exist", None)
        .await
        .unwrap_err();
    assert!(matches!(err, LaunchCompositionError::ProfileNotFound(_)));
    Ok(())
}

#[tokio::test]
async fn enabled_step_with_unimplemented_executor_is_rejected() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let svc = LaunchProfileService::new(
        SqliteLaunchProfileRepo::new(pool.clone()),
        SqliteSkillDefinitionRepo::new(pool.clone()),
        SqliteLaunchTaskRepo::new(pool.clone()),
    );
    let profiles = SqliteLaunchProfileRepo::new(pool.clone());

    let mut steps = profiles.get("standard").await?.expect("standard").steps;
    steps[0].executor = StepExecutor::Future;

    let err = svc
        .resolve_snapshot("standard", Some(steps))
        .await
        .unwrap_err();
    assert!(matches!(
        err,
        LaunchCompositionError::UnsupportedExecutor { .. }
    ));
    Ok(())
}

#[tokio::test]
async fn disabled_step_with_unimplemented_executor_is_allowed() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let svc = LaunchProfileService::new(
        SqliteLaunchProfileRepo::new(pool.clone()),
        SqliteSkillDefinitionRepo::new(pool.clone()),
        SqliteLaunchTaskRepo::new(pool.clone()),
    );
    let profiles = SqliteLaunchProfileRepo::new(pool.clone());

    let mut steps = profiles.get("standard").await?.expect("standard").steps;
    steps[0].executor = StepExecutor::Future;
    steps[0].enabled = false;

    let snapshot = svc.resolve_snapshot("standard", Some(steps)).await?;
    assert!(!snapshot.steps[0].enabled);
    Ok(())
}
