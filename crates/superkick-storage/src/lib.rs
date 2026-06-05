//! SQLite storage layer — migrations and repositories.

pub mod db;
pub mod repo;
pub mod seed;
pub mod sqlite;

pub use db::{connect, connect_with_capacity};
pub use seed::seed_defaults;
pub use sqlite::{
    ProviderUpsert, RecoveryEventKind, RecoveryEventRow, SqliteAgentSessionRepo,
    SqliteArtifactRepo, SqliteAttentionRequestRepo, SqliteConversationRepo, SqliteHandoffRepo,
    SqliteInterruptRepo, SqliteIssueBlockerRepo, SqliteIssueWorkspaceContextRepo,
    SqliteLaunchProfileRepo, SqliteLaunchTaskInterventionRepo, SqliteLaunchTaskRepo,
    SqliteMemoryEntryRepo, SqliteOrchestratorSessionRepo, SqliteProviderSettingsRepo,
    SqlitePullRequestRepo, SqliteRecoveryEventRepo, SqliteRunContextSnapshotRepo,
    SqliteRunEventRepo, SqliteRunRepo, SqliteRunStepRepo, SqliteRuntimeRepo,
    SqliteSessionLifecycleRepo, SqliteSessionOwnershipRepo, SqliteSkillDefinitionRepo,
    SqliteTranscriptRepo, SqliteTurnEventRepo, SqliteTurnRepo, list_recovery_candidates,
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
