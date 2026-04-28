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
    let mut options = SqliteConnectOptions::from_str(database_url)?.create_if_missing(true);
    // WAL journaling requires a real disk file — skip it for in-memory tests.
    if !database_url.contains(":memory:") {
        options = options.journal_mode(sqlx::sqlite::SqliteJournalMode::Wal);
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(max_connections)
        .connect_with(options)
        .await?;

    // Enable foreign keys (off by default in SQLite).
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&pool)
        .await?;

    run_migrations(&pool).await?;

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
    ];

    for (name, sql) in migrations {
        let already_applied: bool =
            sqlx::query_scalar("SELECT COUNT(*) > 0 FROM _migrations WHERE name = ?1")
                .bind(name)
                .fetch_one(pool)
                .await?;

        if !already_applied {
            let mut tx = pool.begin().await?;

            // Execute each statement separately (sqlx doesn't support multi-statement by default).
            for statement in sql.split(';') {
                let trimmed = statement.trim();
                if !trimmed.is_empty() {
                    sqlx::query(trimmed).execute(&mut *tx).await?;
                }
            }

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
