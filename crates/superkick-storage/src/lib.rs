//! SQLite storage layer — migrations and repositories.

pub mod db;
pub mod repo;
pub mod sqlite;

pub use db::{connect, connect_with_capacity};
pub use sqlite::{
    RecoveryEventKind, RecoveryEventRow, SqliteAgentSessionRepo, SqliteArtifactRepo,
    SqliteAttentionRequestRepo, SqliteHandoffRepo, SqliteInterruptRepo, SqliteIssueBlockerRepo,
    SqlitePullRequestRepo, SqliteRecoveryEventRepo, SqliteRunEventRepo, SqliteRunRepo,
    SqliteRunStepRepo, SqliteSessionLifecycleRepo, SqliteSessionOwnershipRepo,
    SqliteTranscriptRepo, list_recovery_candidates,
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
