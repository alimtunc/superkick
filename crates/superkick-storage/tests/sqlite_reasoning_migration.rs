//! Pins migration 040's legacy-data remap on a real SQLite. The pre-040
//! schema is rebuilt from the frozen migration files (applied migrations
//! never change), seeded with `ultra_code` rows in all four reasoning
//! columns, then 040 runs and the remapped rows must load through the real
//! repos — the codec hard-errors on unknown reasoning tags.

use anyhow::Result;
use sqlx::SqlitePool;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::str::FromStr;
use superkick_core::{AgentProvider, LaunchTaskId, ReasoningEffort};
use superkick_storage::repo::{
    LaunchProfileRepo, LaunchTaskRepo, ProviderSettingsRepo, SkillDefinitionRepo,
};
use superkick_storage::{
    SqliteLaunchProfileRepo, SqliteLaunchTaskRepo, SqliteProviderSettingsRepo,
    SqliteSkillDefinitionRepo,
};
use uuid::Uuid;

const PRE_040_SCHEMA: &[&str] = &[
    include_str!("../migrations/023_launch_tasks.sql"),
    include_str!("../migrations/024_launch_task_steps_linked_run_index.sql"),
    include_str!("../migrations/026_launch_task_steps_structured_result.sql"),
    include_str!("../migrations/027_launch_task_steps_failure_classification.sql"),
    include_str!("../migrations/031_launch_tasks_execution_target.sql"),
    include_str!("../migrations/035_launch_task_steps_auto_resume.sql"),
    include_str!("../migrations/036_provider_settings.sql"),
    include_str!("../migrations/037_skill_definitions.sql"),
    include_str!("../migrations/038_launch_profiles.sql"),
    include_str!("../migrations/039_launch_task_profile_snapshot.sql"),
];

const MIGRATION_040: &str = include_str!("../migrations/040_reasoning_per_provider.sql");
const MIGRATION_041: &str = include_str!("../migrations/041_skill_body_artifact.sql");

const TS: &str = "2026-01-01T00:00:00Z";
const TASK_ID: &str = "00000000-0000-0000-0000-00000000a001";
const CODEX_STEP_ID: &str = "00000000-0000-0000-0000-00000000b001";
const CLAUDE_STEP_ID: &str = "00000000-0000-0000-0000-00000000b002";

async fn apply(pool: &SqlitePool, sql: &str) -> Result<()> {
    sqlx::raw_sql(sqlx::AssertSqlSafe(sql.to_string()))
        .execute(pool)
        .await?;
    Ok(())
}

async fn pre_040_pool_with_ultra_code_rows() -> Result<SqlitePool> {
    let options = SqliteConnectOptions::from_str("sqlite::memory:")?
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;

    for sql in PRE_040_SCHEMA {
        apply(&pool, sql).await?;
    }

    apply(
        &pool,
        &format!(
            "INSERT INTO provider_settings \
                 (provider, billing_mode, default_reasoning, default_executor, \
                  sandbox_policy, permission_policy, created_at, updated_at) \
             VALUES \
                 ('codex', 'subscription', 'ultra_code', 'codex_structured', \
                  'workspace_write', 'prompt', '{TS}', '{TS}'), \
                 ('claude', 'subscription', 'ultra_code', 'interactive_pty', \
                  'workspace_write', 'prompt', '{TS}', '{TS}')"
        ),
    )
    .await?;

    apply(
        &pool,
        &format!(
            "INSERT INTO skill_definitions \
                 (id, label, kind, source_kind, source_value, default_provider, \
                  default_reasoning, default_executor, default_session_policy, \
                  default_output_expectation, origin, created_at, updated_at) \
             VALUES \
                 ('legacy_codex', 'Legacy Codex', 'custom', 'prompt', 'do it', 'codex', \
                  'ultra_code', 'codex_structured', 'fresh', 'patch', 'custom', '{TS}', '{TS}'), \
                 ('legacy_claude', 'Legacy Claude', 'custom', 'prompt', 'do it', 'claude', \
                  'ultra_code', 'interactive_pty', 'fresh', 'patch', 'custom', '{TS}', '{TS}')"
        ),
    )
    .await?;

    apply(
        &pool,
        &format!(
            "INSERT INTO launch_profiles (id, name, kind, created_at, updated_at) \
             VALUES ('legacy', 'Legacy', 'custom', '{TS}', '{TS}')"
        ),
    )
    .await?;

    apply(
        &pool,
        "INSERT INTO launch_profile_steps \
             (profile_id, ordering, label, skill_ref, provider, reasoning, \
              executor, session_policy, output_expectation) \
         VALUES \
             ('legacy', 1, 'Plan', 'plan', 'codex', 'ultra_code', \
              'codex_structured', 'fresh', 'plan'), \
             ('legacy', 2, 'Implement', 'implement', 'claude', 'ultra_code', \
              'interactive_pty', 'fresh', 'patch')",
    )
    .await?;

    apply(
        &pool,
        &format!(
            "INSERT INTO launch_tasks \
                 (id, linear_issue_id, recipe_kind, status, created_at, updated_at) \
             VALUES ('{TASK_ID}', 'SUP-1', 'dynamic', 'pending', '{TS}', '{TS}')"
        ),
    )
    .await?;

    apply(
        &pool,
        &format!(
            "INSERT INTO launch_task_steps \
                 (id, launch_task_id, sequence, step_kind, agent_name, provider, \
                  status, reasoning_effort, executor, created_at, updated_at) \
             VALUES \
                 ('{CODEX_STEP_ID}', '{TASK_ID}', 1, 'plan', 'plan', 'codex', \
                  'pending', 'ultra_code', 'codex_structured', '{TS}', '{TS}'), \
                 ('{CLAUDE_STEP_ID}', '{TASK_ID}', 2, 'implement', 'implement', 'claude', \
                  'pending', 'ultra_code', 'interactive_pty', '{TS}', '{TS}')"
        ),
    )
    .await?;

    Ok(pool)
}

#[tokio::test]
async fn migration_040_remaps_ultra_code_by_provider_and_rows_load() -> Result<()> {
    let pool = pre_040_pool_with_ultra_code_rows().await?;
    apply(&pool, MIGRATION_040).await?;
    apply(&pool, MIGRATION_041).await?;

    let providers = SqliteProviderSettingsRepo::new(pool.clone());
    let settings = providers.list().await?;
    let reasoning_of = |provider: AgentProvider| {
        settings
            .iter()
            .find(|s| s.provider == provider)
            .map(|s| s.default_reasoning)
    };
    assert_eq!(
        reasoning_of(AgentProvider::Codex),
        Some(ReasoningEffort::XHigh)
    );
    assert_eq!(
        reasoning_of(AgentProvider::Claude),
        Some(ReasoningEffort::Max)
    );

    let skills = SqliteSkillDefinitionRepo::new(pool.clone());
    let codex_skill = skills.get("legacy_codex").await?.expect("codex skill");
    assert_eq!(codex_skill.default_reasoning, ReasoningEffort::XHigh);
    let claude_skill = skills.get("legacy_claude").await?.expect("claude skill");
    assert_eq!(claude_skill.default_reasoning, ReasoningEffort::Max);

    let profiles = SqliteLaunchProfileRepo::new(pool.clone());
    let legacy = profiles.get("legacy").await?.expect("legacy profile");
    let efforts: Vec<_> = legacy.steps.iter().map(|s| s.reasoning).collect();
    assert_eq!(efforts, [ReasoningEffort::XHigh, ReasoningEffort::Max]);

    // Raw TEXT, not the repo decode — the serde `ultra_code` → `Max` alias
    // would mask a no-op UPDATE on the claude row.
    let raw_efforts: Vec<String> =
        sqlx::query_scalar("SELECT reasoning_effort FROM launch_task_steps ORDER BY sequence")
            .fetch_all(&pool)
            .await?;
    assert_eq!(raw_efforts, ["xhigh", "max"]);

    let tasks = SqliteLaunchTaskRepo::new(pool.clone());
    let steps = tasks
        .list_steps(LaunchTaskId(Uuid::parse_str(TASK_ID)?))
        .await?;
    let efforts: Vec<_> = steps.iter().map(|s| s.reasoning).collect();
    assert_eq!(
        efforts,
        [Some(ReasoningEffort::XHigh), Some(ReasoningEffort::Max)]
    );

    let fk_violations = sqlx::query("PRAGMA foreign_key_check")
        .fetch_all(&pool)
        .await?;
    assert!(fk_violations.is_empty());
    Ok(())
}

#[tokio::test]
async fn migration_040_rebuild_keeps_step_cascade_on_profile_delete() -> Result<()> {
    let pool = pre_040_pool_with_ultra_code_rows().await?;
    apply(&pool, MIGRATION_040).await?;
    apply(&pool, MIGRATION_041).await?;

    apply(&pool, "DELETE FROM launch_profiles WHERE id = 'legacy'").await?;

    let orphan_steps: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM launch_profile_steps WHERE profile_id = 'legacy'")
            .fetch_one(&pool)
            .await?;
    assert_eq!(orphan_steps, 0);
    Ok(())
}
