//! Repository trait definitions.

use std::future::Future;

use anyhow::Result;
use superkick_core::{
    AgentSession, AgentSessionId, Artifact, ArtifactId, AttentionRequest, AttentionRequestId,
    EventId, Interrupt, InterruptId, PullRequest, Run, RunEvent, RunId, RunStep, StepId,
    TranscriptChunk,
};

/// Repository for `Run` entities.
pub trait RunRepo: Send + Sync {
    fn insert(&self, run: &Run) -> impl Future<Output = Result<()>> + Send;
    fn get(&self, id: RunId) -> impl Future<Output = Result<Option<Run>>> + Send;
    fn list_all(&self) -> impl Future<Output = Result<Vec<Run>>> + Send;
    fn update(&self, run: &Run) -> impl Future<Output = Result<()>> + Send;
    fn list_by_issue_id(&self, issue_id: &str) -> impl Future<Output = Result<Vec<Run>>> + Send;
    fn list_by_issue_identifier(
        &self,
        issue_identifier: &str,
    ) -> impl Future<Output = Result<Vec<Run>>> + Send;
    /// Returns the first active run for the stable issue identifier (e.g. `SUP-42`).
    fn find_active_by_issue_identifier(
        &self,
        issue_identifier: &str,
    ) -> impl Future<Output = Result<Option<Run>>> + Send;
}

/// Repository for `RunStep` entities.
pub trait RunStepRepo: Send + Sync {
    fn insert(&self, step: &RunStep) -> impl Future<Output = Result<()>> + Send;
    fn get(&self, id: StepId) -> impl Future<Output = Result<Option<RunStep>>> + Send;
    fn list_by_run(&self, run_id: RunId) -> impl Future<Output = Result<Vec<RunStep>>> + Send;
    fn update(&self, step: &RunStep) -> impl Future<Output = Result<()>> + Send;
}

/// Repository for `RunEvent` entities.
pub trait RunEventRepo: Send + Sync {
    fn insert(&self, event: &RunEvent) -> impl Future<Output = Result<()>> + Send;
    fn get(&self, id: EventId) -> impl Future<Output = Result<Option<RunEvent>>> + Send;
    fn list_by_run(&self, run_id: RunId) -> impl Future<Output = Result<Vec<RunEvent>>> + Send;
    fn list_by_run_from_offset(
        &self,
        run_id: RunId,
        offset: usize,
    ) -> impl Future<Output = Result<Vec<RunEvent>>> + Send;
}

/// Repository for `AgentSession` entities.
pub trait AgentSessionRepo: Send + Sync {
    fn insert(&self, session: &AgentSession) -> impl Future<Output = Result<()>> + Send;
    fn get(&self, id: AgentSessionId) -> impl Future<Output = Result<Option<AgentSession>>> + Send;
    fn list_by_run(&self, run_id: RunId) -> impl Future<Output = Result<Vec<AgentSession>>> + Send;
    fn update(&self, session: &AgentSession) -> impl Future<Output = Result<()>> + Send;
}

/// Repository for `Interrupt` entities.
pub trait InterruptRepo: Send + Sync {
    fn insert(&self, interrupt: &Interrupt) -> impl Future<Output = Result<()>> + Send;
    fn get(&self, id: InterruptId) -> impl Future<Output = Result<Option<Interrupt>>> + Send;
    fn list_by_run(&self, run_id: RunId) -> impl Future<Output = Result<Vec<Interrupt>>> + Send;
    fn update(&self, interrupt: &Interrupt) -> impl Future<Output = Result<()>> + Send;
}

/// Repository for `Artifact` entities.
pub trait ArtifactRepo: Send + Sync {
    fn insert(&self, artifact: &Artifact) -> impl Future<Output = Result<()>> + Send;
    fn get(&self, id: ArtifactId) -> impl Future<Output = Result<Option<Artifact>>> + Send;
    fn list_by_run(&self, run_id: RunId) -> impl Future<Output = Result<Vec<Artifact>>> + Send;
}

/// Repository for `PullRequest` entities.
pub trait PullRequestRepo: Send + Sync {
    fn upsert(&self, pr: &PullRequest) -> impl Future<Output = Result<()>> + Send;
    fn get_by_run(&self, run_id: RunId)
    -> impl Future<Output = Result<Option<PullRequest>>> + Send;
    fn update(&self, pr: &PullRequest) -> impl Future<Output = Result<()>> + Send;
}

/// Repository for durable terminal transcript chunks.
pub trait TranscriptRepo: Send + Sync {
    fn insert(&self, chunk: &TranscriptChunk) -> impl Future<Output = Result<()>> + Send;
    fn list_by_run(
        &self,
        run_id: RunId,
    ) -> impl Future<Output = Result<Vec<TranscriptChunk>>> + Send;
}

/// Repository for `AttentionRequest` entities — operator-facing arbitration
/// asks raised by active runs, above the PTY substrate.
pub trait AttentionRequestRepo: Send + Sync {
    fn insert(&self, request: &AttentionRequest) -> impl Future<Output = Result<()>> + Send;
    fn get(
        &self,
        id: AttentionRequestId,
    ) -> impl Future<Output = Result<Option<AttentionRequest>>> + Send;
    fn list_by_run(
        &self,
        run_id: RunId,
    ) -> impl Future<Output = Result<Vec<AttentionRequest>>> + Send;
    fn update(&self, request: &AttentionRequest) -> impl Future<Output = Result<()>> + Send;
}

/// Atomic operations spanning multiple tables for interrupt workflows.
pub trait InterruptTxRepo: Send + Sync {
    fn create_interrupt_atomic(
        &self,
        run: &Run,
        interrupt: &Interrupt,
    ) -> impl Future<Output = Result<()>> + Send;
}
