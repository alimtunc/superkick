//! Repository trait definitions.

use std::future::Future;

use anyhow::Result;
use chrono::{DateTime, Utc};
use superkick_core::{
    AgentSession, AgentSessionId, Artifact, ArtifactId, AttentionRequest, AttentionRequestId,
    Conversation, ConversationId, ConversationStatus, ConversationSubject, EventId,
    FailureClassification, Handoff, HandoffId, Interrupt, InterruptId, IssueBlocker,
    IssueWorkspaceContext, IssueWorkspaceContextCommentExcerpt, IssueWorkspaceContextId,
    IssueWorkspaceContextLink, IssueWorkspaceContextLinkKind, LaunchTask, LaunchTaskId,
    LaunchTaskStatus, LaunchTaskStep, LaunchTaskStepId, LaunchTaskStepStatus, MemoryCursor,
    MemoryEntry, MemoryPage, OrchestratorCheckpoint, OrchestratorCheckpointId, OrchestratorSession,
    OrchestratorSessionId, OrchestratorStatus, OwnershipEvent, ProtocolEventEnvelope, PullRequest,
    Run, RunEvent, RunId, RunStep, SessionLifecycleEvent, StepId, StepResult, TranscriptChunk,
    Turn, TurnEvent, TurnId, UsageSnapshot,
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

/// Repository for structured chat `Conversation` rows (SUP-100, SUP-107).
///
/// `create` always inserts a new row — multiple conversations can share the
/// same `(subject, agent_id)` pair (SUP-107). `list_by_subject` is the
/// source of truth for the sidebar; the API never collapses sessions.
pub trait ConversationRepo: Send + Sync {
    fn create(
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

    /// List conversations for a subject alongside the first turn's
    /// `user_text` for each row, in a single query. The sidebar uses the
    /// first prompt as the conversation title — fetching it per-row would
    /// issue M+1 round-trips against an unbounded M.
    fn list_by_subject_with_first_text(
        &self,
        subject: &ConversationSubject,
    ) -> impl Future<Output = Result<Vec<(Conversation, Option<String>)>>> + Send;

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

    /// Returns the user_text of the first turn (lowest `seq`) for a given
    /// conversation. Used by the sidebar to derive a human-readable title
    /// from the operator's opening prompt without round-tripping the full
    /// transcript.
    fn first_user_text(
        &self,
        conversation_id: ConversationId,
    ) -> impl Future<Output = Result<Option<String>>> + Send;
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

/// Repository for `LaunchTask` aggregates (SUP-116).
///
/// The parent + steps are always inserted in a single transaction so a
/// half-written task can never appear in `list`. The status updaters call
/// into the domain transition validators (`LaunchTaskStatus` /
/// `LaunchTaskStepStatus`) before persisting — invalid transitions raise
/// `CoreError::InvalidLaunchTask*Transition`, surfaced as 409 by the API.
pub trait LaunchTaskRepo: Send + Sync {
    fn insert_with_steps(
        &self,
        task: &LaunchTask,
        steps: &[LaunchTaskStep],
    ) -> impl Future<Output = Result<()>> + Send;

    fn get(&self, id: LaunchTaskId) -> impl Future<Output = Result<Option<LaunchTask>>> + Send;

    /// Most recent (`created_at` desc) launch task for a Linear issue, or
    /// `None`. The launcher UI uses this to surface "the current attempt"
    /// without paging through history.
    fn get_by_linear_issue(
        &self,
        linear_issue_id: &str,
    ) -> impl Future<Output = Result<Option<LaunchTask>>> + Send;

    /// Combined list with optional filters. `None`/`None` returns every
    /// task. Filters AND together. Pushes the filter into SQL so the
    /// indexes on `status` and `linear_issue_id` actually do something.
    fn list(
        &self,
        status: Option<LaunchTaskStatus>,
        linear_issue_id: Option<&str>,
    ) -> impl Future<Output = Result<Vec<LaunchTask>>> + Send;

    fn list_steps(
        &self,
        task_id: LaunchTaskId,
    ) -> impl Future<Output = Result<Vec<LaunchTaskStep>>> + Send;

    /// Find the step whose `linked_run_id` equals `run_id`. Used by the
    /// run-cancel handler to propagate cancellation up to the owning launch
    /// task — a shadow run cancelled in isolation otherwise leaves the
    /// executor running while the run row is already Cancelled.
    fn find_step_by_linked_run(
        &self,
        run_id: RunId,
    ) -> impl Future<Output = Result<Option<LaunchTaskStep>>> + Send;

    /// Validate the transition via the domain, then persist the new status
    /// inside a single transaction with a `WHERE status = <old>` guard.
    /// A concurrent writer that already moved the row out from under us
    /// surfaces as an anyhow error containing "concurrent state change", not
    /// a domain `InvalidLaunchTask*Transition` (the original transition was
    /// valid against a now-stale snapshot).
    fn update_task_status(
        &self,
        id: LaunchTaskId,
        new_status: LaunchTaskStatus,
    ) -> impl Future<Output = Result<()>> + Send;

    fn update_step_status(
        &self,
        id: LaunchTaskStepId,
        new_status: LaunchTaskStepStatus,
    ) -> impl Future<Output = Result<()>> + Send;

    /// Append-only link assignment. Each `Some` overwrites the matching
    /// column; each `None` leaves the existing value alone. There is
    /// deliberately no way to clear a link — see `LaunchTaskStep::add_links`.
    fn add_step_links(
        &self,
        id: LaunchTaskStepId,
        run_id: Option<RunId>,
        conversation_id: Option<ConversationId>,
        orchestrator_session_id: Option<OrchestratorSessionId>,
    ) -> impl Future<Output = Result<()>> + Send;

    /// Move the parent's `current_step_id` pointer. The supplied `step_id`
    /// (when `Some`) must already belong to `task_id` — the implementation
    /// validates ownership before writing so a typo in the execution loop
    /// cannot cross-link two aggregates.
    fn set_current_step(
        &self,
        task_id: LaunchTaskId,
        step_id: Option<LaunchTaskStepId>,
    ) -> impl Future<Output = Result<()>> + Send;

    /// Atomic step→Running, task→Running, current_step_id=step_id in one tx.
    fn begin_retry(
        &self,
        task_id: LaunchTaskId,
        step_id: LaunchTaskStepId,
    ) -> impl Future<Output = Result<()>> + Send;

    /// SUP-124 — persist the final summary the runner extracted from the
    /// agent's output. `None` clears the column; `Some` overwrites it.
    /// Idempotent — no status guard, callers invoke this around the
    /// `Completed`/`NeedsHuman` transition.
    fn set_step_summary(
        &self,
        id: LaunchTaskStepId,
        summary: Option<String>,
    ) -> impl Future<Output = Result<()>> + Send;

    /// Persist the structured `StepResult`; `None` clears the column.
    fn set_step_structured_result(
        &self,
        id: LaunchTaskStepId,
        result: Option<StepResult>,
    ) -> impl Future<Output = Result<()>> + Send;

    /// Persist the runtime classifier verdict; `None` clears the column on
    /// successful retries (SUP-120). Orthogonal to `set_step_structured_result`
    /// — the two columns capture the agent's report vs. the runtime's verdict
    /// independently.
    fn set_step_failure_classification(
        &self,
        id: LaunchTaskStepId,
        classification: Option<FailureClassification>,
    ) -> impl Future<Output = Result<()>> + Send;
}

/// Repository for `IssueWorkspaceContext` aggregates (SUP-147).
///
/// The parent + comment excerpts + links are always written in a single
/// transaction (`insert_with_children`) so a partially-attached workspace
/// can never appear to a reader. `add_link` is idempotent on
/// `(workspace_context_id, link_kind, target_id)` — relying on the SQL
/// UNIQUE constraint as the source of truth so a concurrent double-attach
/// resolves cleanly without leaking domain errors out of the storage layer.
pub trait IssueWorkspaceContextRepo: Send + Sync {
    fn insert_with_children(
        &self,
        context: &IssueWorkspaceContext,
        excerpts: &[IssueWorkspaceContextCommentExcerpt],
        links: &[IssueWorkspaceContextLink],
    ) -> impl Future<Output = Result<()>> + Send;

    fn get(
        &self,
        id: IssueWorkspaceContextId,
    ) -> impl Future<Output = Result<Option<IssueWorkspaceContext>>> + Send;

    /// Workspaces attached to one Linear issue, ordered `captured_at DESC`.
    /// Re-attaching an issue creates a fresh workspace — the index returns
    /// every historic attempt with the most recent first.
    fn list_by_issue_identifier(
        &self,
        identifier: &str,
    ) -> impl Future<Output = Result<Vec<IssueWorkspaceContext>>> + Send;

    /// Most recent workspace attached to `linear_issue_id` (Linear UUID), or
    /// `None` if the issue has never been attached. The API layer's
    /// `ensure_context_for_issue` helper probes this after the Linear lookup
    /// to avoid a duplicate insert when a concurrent caller attached the same
    /// issue under a different `:id` form (identifier vs. UUID) in between.
    fn find_latest_by_linear_issue_id(
        &self,
        linear_issue_id: &str,
    ) -> impl Future<Output = Result<Option<IssueWorkspaceContext>>> + Send;

    fn list_excerpts(
        &self,
        workspace_context_id: IssueWorkspaceContextId,
    ) -> impl Future<Output = Result<Vec<IssueWorkspaceContextCommentExcerpt>>> + Send;

    fn list_links(
        &self,
        workspace_context_id: IssueWorkspaceContextId,
    ) -> impl Future<Output = Result<Vec<IssueWorkspaceContextLink>>> + Send;

    /// Attach a link, idempotently. Re-attaching `(kind, target_id)` returns
    /// the existing row instead of erroring — the storage layer's contract
    /// is "ensure attached", upheld by the SQL UNIQUE constraint.
    fn add_link(
        &self,
        workspace_context_id: IssueWorkspaceContextId,
        link_kind: IssueWorkspaceContextLinkKind,
        target_id: &str,
    ) -> impl Future<Output = Result<IssueWorkspaceContextLink>> + Send;

    /// Replace the memory ledger pointer. `None` clears the column.
    fn set_memory_ledger_pointer(
        &self,
        id: IssueWorkspaceContextId,
        pointer: Option<String>,
    ) -> impl Future<Output = Result<()>> + Send;

    /// Delete the workspace and cascade to its children. Tests use this to
    /// assert the cascade-delete behaviour; production callers should think
    /// twice before reaching for it.
    fn delete(&self, id: IssueWorkspaceContextId) -> impl Future<Output = Result<()>> + Send;
}

/// Repository for `MemoryEntry` rows (SUP-148).
///
/// Append-only by contract — there is no `update`, no `delete`. Pagination is
/// cursor-based and newest-first; the implementation uses the `limit + 1`
/// lookahead trick to populate `MemoryPage::next_cursor` without a second
/// `COUNT(*)` round-trip.
pub trait MemoryEntryRepo: Send + Sync {
    fn append(&self, entry: &MemoryEntry) -> impl Future<Output = Result<()>> + Send;

    fn list_page(
        &self,
        context_id: IssueWorkspaceContextId,
        cursor: Option<MemoryCursor>,
        limit: u32,
    ) -> impl Future<Output = Result<MemoryPage>> + Send;
}
