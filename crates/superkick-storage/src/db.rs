//! Database connection pool and migration runner.

use anyhow::Result;
use sqlx::SqlitePool;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::str::FromStr;

/// Create a connection pool with WAL mode enabled and run migrations.
pub async fn connect(database_url: &str) -> Result<SqlitePool> {
    connect_with_capacity(database_url, 5).await
}

/// Variant that caps the connection pool. Used by tests backed by
/// `sqlite::memory:` where each additional connection would open its own
/// (empty) in-memory database and hide writes from concurrent readers —
/// forcing `max_connections = 1` serialises access and avoids the split.
pub async fn connect_with_capacity(database_url: &str, max_connections: u32) -> Result<SqlitePool> {
    // `foreign_keys` is per-connection in SQLite; setting it on the
    // `SqliteConnectOptions` ensures every pooled connection has FK
    // enforcement on, not just the first one drawn from the pool.
    let mut options = SqliteConnectOptions::from_str(database_url)?
        .create_if_missing(true)
        .foreign_keys(true);
    // WAL journaling requires a real disk file — skip it for in-memory tests.
    // `synchronous = NORMAL` is the recommended pairing with WAL: the WAL is
    // synced on checkpoint rather than every commit, without losing
    // durability beyond the last checkpoint on power loss.
    if !database_url.contains(":memory:") {
        options = options
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
            .synchronous(sqlx::sqlite::SqliteSynchronous::Normal);
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(max_connections)
        .connect_with(options)
        .await?;

    run_migrations(&pool).await?;
    crate::seed::seed_defaults(&pool).await?;

    tracing::info!("database ready (WAL mode)");
    Ok(pool)
}

/// Run embedded SQL migrations in order.
async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS _migrations (
            name TEXT PRIMARY KEY NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )
    .execute(pool)
    .await?;

    let migrations: &[(&str, &str)] = &[
        (
            "001_initial_schema",
            include_str!("../migrations/001_initial_schema.sql"),
        ),
        (
            "002_launch_profile",
            include_str!("../migrations/002_launch_profile.sql"),
        ),
        (
            "003_active_run_dedup",
            include_str!("../migrations/003_active_run_dedup.sql"),
        ),
        (
            "004_active_run_dedup_issue_identifier",
            include_str!("../migrations/004_active_run_dedup_issue_identifier.sql"),
        ),
        (
            "005_run_use_worktree",
            include_str!("../migrations/005_run_use_worktree.sql"),
        ),
        (
            "005_pull_requests",
            include_str!("../migrations/005_pull_requests.sql"),
        ),
        (
            "006_execution_mode",
            include_str!("../migrations/006_execution_mode.sql"),
        ),
        (
            "007_terminal_transcripts",
            include_str!("../migrations/007_terminal_transcripts.sql"),
        ),
        (
            "008_attention_requests",
            include_str!("../migrations/008_attention_requests.sql"),
        ),
        (
            "009_agent_session_linear_context",
            include_str!("../migrations/009_agent_session_linear_context.sql"),
        ),
        (
            "010_child_handoffs_and_session_lineage",
            include_str!("../migrations/010_child_handoffs_and_session_lineage.sql"),
        ),
        (
            "011_session_ownership",
            include_str!("../migrations/011_session_ownership.sql"),
        ),
        (
            "012_session_lifecycle_events",
            include_str!("../migrations/012_session_lifecycle_events.sql"),
        ),
        (
            "013_issue_blockers",
            include_str!("../migrations/013_issue_blockers.sql"),
        ),
        (
            "014_run_budget_and_pause",
            include_str!("../migrations/014_run_budget_and_pause.sql"),
        ),
        (
            "015_run_budget_grant",
            include_str!("../migrations/015_run_budget_grant.sql"),
        ),
        (
            "016_run_heartbeat_recovery",
            include_str!("../migrations/016_run_heartbeat_recovery.sql"),
        ),
        (
            "017_runtime_registry",
            include_str!("../migrations/017_runtime_registry.sql"),
        ),
        (
            "018_agent_session_tool_policy",
            include_str!("../migrations/018_agent_session_tool_policy.sql"),
        ),
        (
            "019_agent_session_provider_session_id",
            include_str!("../migrations/019_agent_session_provider_session_id.sql"),
        ),
        (
            "020_orchestrator_sessions",
            include_str!("../migrations/020_orchestrator_sessions.sql"),
        ),
        (
            "021_conversations_turns_events",
            include_str!("../migrations/021_conversations_turns_events.sql"),
        ),
        (
            "022_conversations_drop_unique_subject_agent",
            include_str!("../migrations/022_conversations_drop_unique_subject_agent.sql"),
        ),
        (
            "023_launch_tasks",
            include_str!("../migrations/023_launch_tasks.sql"),
        ),
        (
            "024_launch_task_steps_linked_run_index",
            include_str!("../migrations/024_launch_task_steps_linked_run_index.sql"),
        ),
        (
            "025_agent_session_runner_mode",
            include_str!("../migrations/025_agent_session_runner_mode.sql"),
        ),
        (
            "026_launch_task_steps_structured_result",
            include_str!("../migrations/026_launch_task_steps_structured_result.sql"),
        ),
        (
            "027_launch_task_steps_failure_classification",
            include_str!("../migrations/027_launch_task_steps_failure_classification.sql"),
        ),
        (
            "028_issue_workspace_contexts",
            include_str!("../migrations/028_issue_workspace_contexts.sql"),
        ),
        (
            "029_memory_entries",
            include_str!("../migrations/029_memory_entries.sql"),
        ),
        (
            "030_launch_task_interventions",
            include_str!("../migrations/030_launch_task_interventions.sql"),
        ),
        (
            "031_launch_tasks_execution_target",
            include_str!("../migrations/031_launch_tasks_execution_target.sql"),
        ),
        (
            "032_run_agent_overrides",
            include_str!("../migrations/032_run_agent_overrides.sql"),
        ),
        (
            "033_run_events_seq",
            include_str!("../migrations/033_run_events_seq.sql"),
        ),
        (
            "034_run_context_snapshots",
            include_str!("../migrations/034_run_context_snapshots.sql"),
        ),
        (
            "035_launch_task_steps_auto_resume",
            include_str!("../migrations/035_launch_task_steps_auto_resume.sql"),
        ),
        (
            "036_provider_settings",
            include_str!("../migrations/036_provider_settings.sql"),
        ),
        (
            "037_skill_definitions",
            include_str!("../migrations/037_skill_definitions.sql"),
        ),
        (
            "038_launch_profiles",
            include_str!("../migrations/038_launch_profiles.sql"),
        ),
        (
            "039_launch_task_profile_snapshot",
            include_str!("../migrations/039_launch_task_profile_snapshot.sql"),
        ),
        (
            "040_reasoning_per_provider",
            include_str!("../migrations/040_reasoning_per_provider.sql"),
        ),
        (
            "041_skill_body_artifact",
            include_str!("../migrations/041_skill_body_artifact.sql"),
        ),
    ];

    for (name, sql) in migrations {
        let already_applied: bool =
            sqlx::query_scalar("SELECT COUNT(*) > 0 FROM _migrations WHERE name = ?1")
                .bind(name)
                .fetch_one(pool)
                .await?;

        if !already_applied {
            let mut tx = pool.begin().await?;

            sqlx::raw_sql(sqlx::AssertSqlSafe(sql.to_string()))
                .execute(&mut *tx)
                .await?;

            sqlx::query("INSERT INTO _migrations (name) VALUES (?1)")
                .bind(name)
                .execute(&mut *tx)
                .await?;

            tx.commit().await?;

            tracing::info!(migration = name, "applied migration");
        }
    }

    Ok(())
}
