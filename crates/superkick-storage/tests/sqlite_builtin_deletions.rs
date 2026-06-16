//! Real-SQLite coverage for the migration 054 `builtin_deletions` tombstones.
//! A tombstoned builtin agent/skill must stay gone across a re-seed (the
//! operator's hard delete sticks), while a non-tombstoned builtin still seeds.

use anyhow::Result;
use superkick_storage::repo::{
    AgentDefinitionRepo, BuiltinDeletionRepo, BuiltinKind, SkillDefinitionRepo,
};
use superkick_storage::seed::seed_defaults;
use superkick_storage::{
    SqliteAgentDefinitionRepo, SqliteBuiltinDeletionRepo, SqliteSkillDefinitionRepo, connect,
};

#[tokio::test]
async fn record_clear_and_list_round_trip() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    let repo = SqliteBuiltinDeletionRepo::new(pool.clone());

    repo.record(BuiltinKind::Agent, "codex-plan").await?;
    // Idempotent: recording the same tombstone twice is a no-op, not an error.
    repo.record(BuiltinKind::Agent, "codex-plan").await?;
    repo.record(BuiltinKind::Skill, "plan").await?;

    let agents = repo.deleted_keys(BuiltinKind::Agent).await?;
    assert!(agents.contains("codex-plan"));
    assert!(
        !agents.contains("plan"),
        "skill key must not leak into agents"
    );

    let skills = repo.deleted_keys(BuiltinKind::Skill).await?;
    assert!(skills.contains("plan"));

    repo.clear(BuiltinKind::Agent, "codex-plan").await?;
    assert!(repo.deleted_keys(BuiltinKind::Agent).await?.is_empty());
    Ok(())
}

#[tokio::test]
async fn seed_skips_tombstoned_builtin_agent_across_reboot() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    // First boot seeds the builtins.
    seed_defaults(&pool).await?;
    let agent_repo = SqliteAgentDefinitionRepo::new(pool.clone());
    assert!(agent_repo.get("codex-plan").await?.is_some());

    // Operator hard-deletes the builtin: remove the row + tombstone it.
    let deletions = SqliteBuiltinDeletionRepo::new(pool.clone());
    agent_repo.delete("codex-plan").await?;
    deletions.record(BuiltinKind::Agent, "codex-plan").await?;

    // Reboot: the seeder must not resurrect a tombstoned builtin.
    seed_defaults(&pool).await?;
    assert!(
        agent_repo.get("codex-plan").await?.is_none(),
        "tombstoned builtin agent reappeared after re-seed"
    );
    // A sibling builtin is untouched.
    assert!(agent_repo.get("codex-implement").await?.is_some());

    // Clearing the tombstone lets a re-seed restore it.
    deletions.clear(BuiltinKind::Agent, "codex-plan").await?;
    seed_defaults(&pool).await?;
    assert!(agent_repo.get("codex-plan").await?.is_some());
    Ok(())
}

#[tokio::test]
async fn seed_skips_tombstoned_builtin_skill_across_reboot() -> Result<()> {
    let pool = connect("sqlite::memory:").await?;
    seed_defaults(&pool).await?;
    let skill_repo = SqliteSkillDefinitionRepo::new(pool.clone());
    assert!(skill_repo.get("plan").await?.is_some());

    let deletions = SqliteBuiltinDeletionRepo::new(pool.clone());
    skill_repo.delete("plan").await?;
    deletions.record(BuiltinKind::Skill, "plan").await?;

    seed_defaults(&pool).await?;
    assert!(
        skill_repo.get("plan").await?.is_none(),
        "tombstoned builtin skill reappeared after re-seed"
    );
    assert!(skill_repo.get("implement").await?.is_some());
    Ok(())
}
