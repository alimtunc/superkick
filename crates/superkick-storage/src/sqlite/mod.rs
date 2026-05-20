//! SQLite repository implementations.

use std::fmt;

use anyhow::{Result, anyhow};
use sqlx::sqlite::SqliteQueryResult;

mod agent_sessions;
mod artifacts;
mod attention_requests;
mod codec;
mod conversations;
mod events;
mod handoffs;
mod interrupts;
mod issue_blockers;
mod issue_workspace_contexts;
mod launch_task_interventions;
mod launch_tasks;
mod memory_entries;
mod orchestrator_sessions;
mod pull_requests;
mod recovery;
mod runs;
mod runtimes;
mod session_lifecycle;
mod session_ownership;
mod steps;
mod transcripts;

pub use agent_sessions::SqliteAgentSessionRepo;
pub use artifacts::SqliteArtifactRepo;
pub use attention_requests::SqliteAttentionRequestRepo;
pub use conversations::{SqliteConversationRepo, SqliteTurnEventRepo, SqliteTurnRepo};
pub use events::SqliteRunEventRepo;
pub use handoffs::SqliteHandoffRepo;
pub use interrupts::SqliteInterruptRepo;
pub use issue_blockers::SqliteIssueBlockerRepo;
pub use issue_workspace_contexts::SqliteIssueWorkspaceContextRepo;
pub use launch_task_interventions::SqliteLaunchTaskInterventionRepo;
pub use launch_tasks::SqliteLaunchTaskRepo;
pub use memory_entries::SqliteMemoryEntryRepo;
pub use orchestrator_sessions::SqliteOrchestratorSessionRepo;
pub use pull_requests::SqlitePullRequestRepo;
pub use recovery::{
    RecoveryEventKind, RecoveryEventRow, SqliteRecoveryEventRepo, list_recovery_candidates,
};
pub use runs::SqliteRunRepo;
pub use runtimes::{ProviderUpsert, SqliteRuntimeRepo};
pub use session_lifecycle::SqliteSessionLifecycleRepo;
pub use session_ownership::SqliteSessionOwnershipRepo;
pub use steps::SqliteRunStepRepo;
pub use transcripts::SqliteTranscriptRepo;

pub(super) fn ensure_updated(
    result: SqliteQueryResult,
    entity: &str,
    id: impl fmt::Display,
) -> Result<()> {
    if result.rows_affected() == 0 {
        return Err(anyhow!("{entity} {id} not found"));
    }
    Ok(())
}
