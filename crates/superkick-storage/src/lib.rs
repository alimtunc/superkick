//! SQLite storage layer — migrations and repositories.

pub mod db;
pub mod repo;
pub mod sqlite;

pub use db::connect;
pub use sqlite::{
    SqliteAgentSessionRepo, SqliteArtifactRepo, SqliteInterruptRepo, SqlitePullRequestRepo,
    SqliteRunEventRepo, SqliteRunRepo, SqliteRunStepRepo,
};

/// Check if an anyhow error chain contains a SQLite unique constraint violation.
pub fn is_unique_violation(err: &anyhow::Error) -> bool {
    err.chain().any(|cause| {
        cause
            .downcast_ref::<sqlx::Error>()
            .is_some_and(|sqlx_err| {
                matches!(sqlx_err, sqlx::Error::Database(db_err) if db_err.is_unique_violation())
            })
    })
}
