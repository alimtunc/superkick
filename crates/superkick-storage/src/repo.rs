//! Repository trait definitions.

use std::future::Future;

use anyhow::Result;
use chrono::{DateTime, Utc};
use superkick_core::{
    AgentSession, AgentSessionId, Artifact, ArtifactId, AttentionRequest, AttentionRequestId,
    Conversation, ConversationId, ConversationStatus, ConversationSubject, EventId, Handoff,
    HandoffId, Interrupt, InterruptId, IssueBlocker, OrchestratorCheckpoint,
    OrchestratorCheckpointId, OrchestratorSession, OrchestratorSessionId, OrchestratorStatus,
    OwnershipEvent, ProtocolEventEnvelope, PullRequest, Run, RunEvent, RunId, RunStep,
    SessionLifecycleEvent, StepId, TranscriptChunk, Turn, TurnEvent, TurnId, UsageSnapshot,
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
    /// Persist the provider-side session/thread identifier (Claude
    /// `session_id`, Codex `thread_id`) so a follow-up turn from a different
    /// process can resume the conversation. Idempotent — overwrites the
    /// existing value (Codex may emit a fresh thread id on resume).
    fn set_provider_session_id(
        &self,
        id: AgentSessionId,
        provider_session_id: &str,
    ) -> impl Future<Output = Result<()>> + Send;
    /// Read the persisted provider session id, if any. `Ok(None)` covers
    /// both "row exists but column is NULL" and "no such session".
    fn get_provider_session_id(
        &self,
        id: AgentSessionId,
    ) -> impl Future<Output = Result<Option<String>>> + Send;
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

/// Repository for structured chat `Conversation` rows (SUP-100).
///
/// Idempotency: `create_or_get` on a `(subject, agent_id)` pair returns the
/// existing row when one is present so the API can route repeat opens to the
/// same conversation without conflict.
pub trait ConversationRepo: Send + Sync {
    fn create_or_get(
        &self,
        subject: &ConversationSubject,
        agent_id: &str,
        provider: superkick_core::AgentProvider,
        now: DateTime<Utc>,
    ) -> impl Future<Output = Result<Conversation>> + Send;

    fn get(&self, id: ConversationId) -> impl Future<Output = Result<Option<Conversation>>> + Send;

    fn list_by_subject(
        &self,
        subject: &ConversationSubject,
    ) -> impl Future<Output = Result<Vec<Conversation>>> + Send;

    fn set_provider_session_id(
        &self,
        id: ConversationId,
        provider_session_id: &str,
        now: DateTime<Utc>,
    ) -> impl Future<Output = Result<()>> + Send;

    fn set_status(
        &self,
        id: ConversationId,
        status: ConversationStatus,
        now: DateTime<Utc>,
    ) -> impl Future<Output = Result<()>> + Send;

    fn set_last_turn_at(
        &self,
        id: ConversationId,
        at: DateTime<Utc>,
    ) -> impl Future<Output = Result<()>> + Send;
}

/// Repository for `Turn` rows. The runner allocates `seq` per conversation
/// and updates the lifecycle status as the protocol stream advances.
pub trait TurnRepo: Send + Sync {
    fn create_pending(
        &self,
        conversation_id: ConversationId,
        user_text: &str,
        now: DateTime<Utc>,
    ) -> impl Future<Output = Result<Turn>> + Send;

    fn get(&self, id: TurnId) -> impl Future<Output = Result<Option<Turn>>> + Send;

    fn list_by_conversation(
        &self,
        conversation_id: ConversationId,
    ) -> impl Future<Output = Result<Vec<Turn>>> + Send;

    /// Returns the active (non-terminal) turn for a conversation, if any.
    /// Used to enforce the "one streaming turn per conversation" rule.
    fn find_active_for_conversation(
        &self,
        conversation_id: ConversationId,
    ) -> impl Future<Output = Result<Option<Turn>>> + Send;

    fn mark_streaming(
        &self,
        id: TurnId,
        now: DateTime<Utc>,
    ) -> impl Future<Output = Result<()>> + Send;

    fn mark_completed(
        &self,
        id: TurnId,
        usage: Option<&UsageSnapshot>,
        now: DateTime<Utc>,
    ) -> impl Future<Output = Result<()>> + Send;

    fn mark_failed(
        &self,
        id: TurnId,
        code: &str,
        message: &str,
        usage: Option<&UsageSnapshot>,
        now: DateTime<Utc>,
    ) -> impl Future<Output = Result<()>> + Send;

    fn mark_cancelled(
        &self,
        id: TurnId,
        reason: &str,
        now: DateTime<Utc>,
    ) -> impl Future<Output = Result<()>> + Send;
}

/// Repository for the append-only stream of `TurnEvent`s.
pub trait TurnEventRepo: Send + Sync {
    fn append(
        &self,
        turn_id: TurnId,
        envelope: &ProtocolEventEnvelope,
    ) -> impl Future<Output = Result<TurnEvent>> + Send;

    fn list_by_turn(&self, turn_id: TurnId) -> impl Future<Output = Result<Vec<TurnEvent>>> + Send;

    /// Replay events for a turn from a given seq (exclusive). Used by the
    /// SSE handler to honour the `Last-Event-ID` reconnect header.
    fn list_by_turn_after(
        &self,
        turn_id: TurnId,
        after_seq: u64,
    ) -> impl Future<Output = Result<Vec<TurnEvent>>> + Send;

    /// Highest seq currently persisted for a turn. Used by the runner to
    /// allocate the next envelope's seq when constructing them itself.
    fn last_seq(&self, turn_id: TurnId) -> impl Future<Output = Result<Option<u64>>> + Send;
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

/// Repository for `OrchestratorSession` and `OrchestratorCheckpoint` (SUP-102).
///
/// Sessions are long-running orchestrator threads that span multiple runs;
/// checkpoints are compacted summaries of the session's transcript / event
/// stream. `insert_checkpoint` is atomic with the session pointer update so
/// `latest_checkpoint_id` and `last_event_cursor` can never reference a
/// checkpoint that didn't actually persist.
pub trait OrchestratorSessionRepo: Send + Sync {
    fn insert(&self, session: &OrchestratorSession) -> impl Future<Output = Result<()>> + Send;

    fn get(
        &self,
        id: OrchestratorSessionId,
    ) -> impl Future<Output = Result<Option<OrchestratorSession>>> + Send;

    fn list_by_status(
        &self,
        status: OrchestratorStatus,
    ) -> impl Future<Output = Result<Vec<OrchestratorSession>>> + Send;

    /// Single-scan list of every session ordered by `created_at`. Mirrors
    /// `RunRepo::list_all` so the API layer never has to issue one query
    /// per status to enumerate sessions.
    fn list_all(&self) -> impl Future<Output = Result<Vec<OrchestratorSession>>> + Send;

    fn list_by_issue_identifier(
        &self,
        issue_identifier: &str,
    ) -> impl Future<Output = Result<Vec<OrchestratorSession>>> + Send;

    /// Whole-session update — replaces every mutable column. Used by the
    /// PATCH handler.
    fn update(&self, session: &OrchestratorSession) -> impl Future<Output = Result<()>> + Send;

    /// Persist the provider-side session/thread identifier so a follow-up
    /// turn can resume.
    fn set_provider_session_id(
        &self,
        id: OrchestratorSessionId,
        provider_session_id: &str,
    ) -> impl Future<Output = Result<()>> + Send;

    /// Insert a checkpoint and update the session's `latest_checkpoint_id` +
    /// `last_event_cursor` in a single transaction. A crash between the two
    /// writes would otherwise leave the denormalised pointer dangling.
    fn insert_checkpoint(
        &self,
        checkpoint: &OrchestratorCheckpoint,
    ) -> impl Future<Output = Result<()>> + Send;

    fn list_checkpoints_by_session(
        &self,
        id: OrchestratorSessionId,
    ) -> impl Future<Output = Result<Vec<OrchestratorCheckpoint>>> + Send;

    fn latest_checkpoint(
        &self,
        id: OrchestratorSessionId,
    ) -> impl Future<Output = Result<Option<OrchestratorCheckpoint>>> + Send;

    fn get_checkpoint(
        &self,
        id: OrchestratorCheckpointId,
    ) -> impl Future<Output = Result<Option<OrchestratorCheckpoint>>> + Send;
}
