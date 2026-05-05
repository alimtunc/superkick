//! Repository trait definitions.

use std::future::Future;

use anyhow::Result;
use chrono::{DateTime, Utc};
use superkick_core::{
    AgentSession, AgentSessionId, Artifact, ArtifactId, AttentionRequest, AttentionRequestId,
    EventId, Handoff, HandoffId, Interrupt, InterruptId, IssueBlocker, OwnershipEvent, PullRequest,
    Run, RunEvent, RunId, RunStep, SessionLifecycleEvent, StepId, TranscriptChunk,
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
    /// Stamp a fresh heartbeat without touching `state` / `updated_at` / pause
    /// fields. Skips terminal runs at the storage level so a late-arriving
    /// session lifecycle event for a finished run cannot revive its heartbeat
    /// clock for the recovery scheduler. See SUP-73 AC1.
    fn update_heartbeat(
        &self,
        run_id: RunId,
        now: DateTime<Utc>,
    ) -> impl Future<Output = Result<()>> + Send;
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

/// Repository for `Handoff` entities — structured child-session coordination
/// artifacts (SUP-46). Handoffs are how work moves between sessions without
/// PTY-to-PTY chatter.
pub trait HandoffRepo: Send + Sync {
    fn insert(&self, handoff: &Handoff) -> impl Future<Output = Result<()>> + Send;
    fn get(&self, id: HandoffId) -> impl Future<Output = Result<Option<Handoff>>> + Send;
    fn list_by_run(&self, run_id: RunId) -> impl Future<Output = Result<Vec<Handoff>>> + Send;
    fn update(&self, handoff: &Handoff) -> impl Future<Output = Result<()>> + Send;
}

/// Repository for session ownership transitions (SUP-48).
///
/// `apply` writes the audit row and updates the denormalised snapshot on
/// `agent_sessions` in one transaction so readers can never observe an event
/// without its resulting state.
pub trait SessionOwnershipRepo: Send + Sync {
    fn apply(
        &self,
        event: &OwnershipEvent,
        snapshot_since: DateTime<Utc>,
    ) -> impl Future<Output = Result<()>> + Send;
    fn list_by_session(
        &self,
        session_id: AgentSessionId,
    ) -> impl Future<Output = Result<Vec<OwnershipEvent>>> + Send;
    fn list_by_run(
        &self,
        run_id: RunId,
    ) -> impl Future<Output = Result<Vec<OwnershipEvent>>> + Send;
    /// Read the current denormalised snapshot (current orchestration owner +
    /// `since` timestamp) for one session.
    fn current(
        &self,
        session_id: AgentSessionId,
    ) -> impl Future<Output = Result<Option<OwnershipSnapshot>>> + Send;
    /// Batch variant of `current` for every session in a run — avoids the
    /// N+1 query that would otherwise happen when rendering a run detail page.
    fn list_current_by_run(
        &self,
        run_id: RunId,
    ) -> impl Future<Output = Result<Vec<OwnershipSnapshot>>> + Send;
}

/// Denormalised ownership snapshot read straight off `agent_sessions`. The
/// `since` timestamp is the moment the current owner took effect — `None` for
/// legacy rows that predate the ownership migration.
#[derive(Debug, Clone)]
pub struct OwnershipSnapshot {
    pub session_id: AgentSessionId,
    pub run_id: RunId,
    pub owner: superkick_core::OrchestrationOwner,
    pub since: Option<DateTime<Utc>>,
}

/// Repository for `SessionLifecycleEvent` entities (SUP-79).
///
/// Append-only audit stream — every observable lifecycle transition that the
/// orchestrator runtime publishes is persisted here so spawn-and-observe
/// decisions and later post-mortems can replay the exact sequence of state
/// changes independent of the run event stream.
pub trait SessionLifecycleRepo: Send + Sync {
    fn insert(&self, event: &SessionLifecycleEvent) -> impl Future<Output = Result<()>> + Send;
    fn list_by_session(
        &self,
        session_id: AgentSessionId,
    ) -> impl Future<Output = Result<Vec<SessionLifecycleEvent>>> + Send;
    fn list_by_run(
        &self,
        run_id: RunId,
    ) -> impl Future<Output = Result<Vec<SessionLifecycleEvent>>> + Send;
}

/// Atomic operations spanning multiple tables for interrupt workflows.
pub trait InterruptTxRepo: Send + Sync {
    fn create_interrupt_atomic(
        &self,
        run: &Run,
        interrupt: &Interrupt,
    ) -> impl Future<Output = Result<()>> + Send;
}

/// Repository for `issue_blockers` — Linear "blocks" relation snapshots
/// (SUP-81). Re-polling Linear replaces the rows for a given downstream
/// wholesale; `list_all` returns the pre-replacement state so the caller can
/// diff it against the fresh snapshot to detect transitions.
pub trait IssueBlockerRepo: Send + Sync {
    /// Replace every row for `downstream_issue_id` with `blockers` in a
    /// single transaction. Passing an empty slice deletes any stale rows.
    fn replace_for_downstream(
        &self,
        downstream_issue_id: &str,
        blockers: &[IssueBlocker],
    ) -> impl Future<Output = Result<()>> + Send;

    /// Replace the rows for every downstream in `entries` in a single
    /// transaction. `(downstream_id, rows)` pairs are written atomically: a
    /// failure on any pair rolls back the entire snapshot so the poll diff
    /// never observes a partial state.
    fn replace_for_downstreams(
        &self,
        entries: &[(String, Vec<IssueBlocker>)],
    ) -> impl Future<Output = Result<()>> + Send;

    /// Return every row, used to build a pre-poll snapshot for diffing.
    fn list_all(&self) -> impl Future<Output = Result<Vec<IssueBlocker>>> + Send;

    /// Return rows for a single downstream issue.
    fn list_for_downstream(
        &self,
        downstream_issue_id: &str,
    ) -> impl Future<Output = Result<Vec<IssueBlocker>>> + Send;
}
