//! Repository trait definitions.

use std::future::Future;
use std::pin::Pin;

use anyhow::Result;
use chrono::{DateTime, Utc};
use superkick_core::{
    AgentProvider, CoreAgentDefinition, LaunchProfile, ProfileUsage, ProviderSettings,
    SkillDefinition,
};
use superkick_core::{
    AgentSession, AgentSessionId, Artifact, ArtifactId, AttentionRequest, AttentionRequestId,
    Conversation, ConversationId, ConversationStatus, ConversationSubject, DiffReviewComment,
    DiffReviewCommentId, DiffReviewFileReviewedChange, DiffReviewFileState, DiffReviewState,
    DiffReviewSubject, DiffReviewThread, DiffReviewThreadId, EventId, FailureClassification,
    Handoff, HandoffId, Interrupt, InterruptId, IssueBlocker, IssuePullRequest,
    IssueWorkspaceContext, IssueWorkspaceContextCommentExcerpt, IssueWorkspaceContextId,
    IssueWorkspaceContextLink, IssueWorkspaceContextLinkKind, LaunchTask, LaunchTaskId,
    LaunchTaskIntervention, LaunchTaskInterventionId, LaunchTaskStatus, LaunchTaskStep,
    LaunchTaskStepId, LaunchTaskStepStatus, MemoryCursor, MemoryEntry, MemoryPage,
    NewDiffReviewComment, NewDiffReviewThread, OrchestratorCheckpoint, OrchestratorCheckpointId,
    OrchestratorSession, OrchestratorSessionId, OrchestratorStatus, OwnershipEvent, PrDiffFile,
    ProtocolEventEnvelope, PullRequest, Run, RunContextSnapshot, RunEvent, RunId, RunStep,
    SessionLifecycleEvent, StepId, StepResult, TranscriptChunk, Turn, TurnEvent, TurnId,
    UsageSnapshot,
};

/// Repository for `Run` entities.
pub trait RunRepo: Send + Sync {
    fn insert(&self, run: &Run) -> impl Future<Output = Result<()>> + Send;
    fn get(&self, id: RunId) -> impl Future<Output = Result<Option<Run>>> + Send;
    fn list_all(&self) -> impl Future<Output = Result<Vec<Run>>> + Send;
    /// Most recently started runs, bounded — for surfaces (search, dashboards)
    /// that must not scan the whole monotonically-growing table.
    fn list_recent(&self, limit: u32) -> impl Future<Output = Result<Vec<Run>>> + Send;
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
    /// All non-terminal Launch Task shadow runs (`trigger_source='launch_task'`,
    /// `state NOT IN (completed, failed, cancelled)`) — the exact rows that block
    /// relaunch and read "live" in the UI. Liveness reconciliation enumerates
    /// these; the complement of the recovery scheduler's `list_recovery_candidates`,
    /// which deliberately excludes shadow runs.
    fn list_active_launch_task_runs(&self) -> impl Future<Output = Result<Vec<Run>>> + Send;
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
    /// Persist an event and return the per-run `seq` the storage layer assigned
    /// it (SUP-185). The returned value lets the publishing wrapper broadcast a
    /// live copy carrying the same `seq` the persisted row got, so the SSE
    /// stream and the REST backfill agree on ordering.
    fn insert(&self, event: &RunEvent) -> impl Future<Output = Result<u64>> + Send;
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

/// Repository for GitHub PRs linked directly to Linear issues.
pub trait IssuePullRequestRepo: Send + Sync {
    fn upsert_issue_pr(&self, pr: &IssuePullRequest) -> impl Future<Output = Result<()>> + Send;
    fn list_by_issue(
        &self,
        issue_identifier: &str,
    ) -> impl Future<Output = Result<Vec<IssuePullRequest>>> + Send;
    fn replace_diff_files(
        &self,
        issue_identifier: &str,
        repo_slug: &str,
        number: u32,
        head_sha: &str,
        files: &[PrDiffFile],
    ) -> impl Future<Output = Result<()>> + Send;
    fn list_diff_files(
        &self,
        issue_identifier: &str,
        repo_slug: &str,
        number: u32,
        head_sha: &str,
    ) -> impl Future<Output = Result<Vec<PrDiffFile>>> + Send;
}

/// Repository for local inline diff review state (SUP-199 runs, SUP-205 PRs).
pub trait DiffReviewRepo: Send + Sync {
    fn list_by_subject(
        &self,
        subject: DiffReviewSubject,
    ) -> impl Future<Output = Result<DiffReviewState>> + Send;

    /// Convenience wrapper for the run-review path so existing callers are
    /// untouched by the subject generalization (SUP-205).
    fn list_by_run(&self, run_id: RunId) -> impl Future<Output = Result<DiffReviewState>> + Send {
        self.list_by_subject(DiffReviewSubject::run(run_id))
    }

    fn get_thread(
        &self,
        thread_id: DiffReviewThreadId,
    ) -> impl Future<Output = Result<Option<DiffReviewThread>>> + Send;

    fn create_thread(
        &self,
        thread: NewDiffReviewThread,
    ) -> impl Future<Output = Result<DiffReviewThread>> + Send;

    fn add_comment(
        &self,
        thread_id: DiffReviewThreadId,
        comment: NewDiffReviewComment,
    ) -> impl Future<Output = Result<DiffReviewComment>> + Send;

    fn update_comment(
        &self,
        comment_id: DiffReviewCommentId,
        body: String,
    ) -> impl Future<Output = Result<Option<DiffReviewComment>>> + Send;

    fn delete_comment(
        &self,
        comment_id: DiffReviewCommentId,
    ) -> impl Future<Output = Result<bool>> + Send;

    fn set_thread_resolved(
        &self,
        thread_id: DiffReviewThreadId,
        resolved: bool,
    ) -> impl Future<Output = Result<Option<DiffReviewThread>>> + Send;

    fn delete_thread(
        &self,
        thread_id: DiffReviewThreadId,
    ) -> impl Future<Output = Result<bool>> + Send;

    fn set_file_reviewed(
        &self,
        change: DiffReviewFileReviewedChange,
    ) -> impl Future<Output = Result<DiffReviewFileState>> + Send;
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

    /// SUP-191 — persist the auto-resume counter and the Codex `resume_key`
    /// (thread_id) for a timed-out step. Idempotent, no status guard: the
    /// executor calls this before each resume and at the park point so an
    /// operator retry can `codex exec resume` the same conversation. `None`
    /// `resume_key` clears the column (a fresh run path).
    fn set_step_auto_resume(
        &self,
        id: LaunchTaskStepId,
        auto_resume_count: u32,
        resume_key: Option<String>,
    ) -> impl Future<Output = Result<()>> + Send;
}

/// Row counts touched by an issue-clean operation. Returned so the API can
/// report how much was archived or purged without a follow-up read.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Serialize)]
pub struct IssueCleanOutcome {
    pub runs: u64,
    pub launch_tasks: u64,
}

/// "Clean issue" operations spanning the run and launch-task aggregates for a
/// single Linear issue (keyed by the stable identifier, e.g. `SUP-122`).
///
/// `archive` is stats-safe: it stamps `archived_at` so the rows drop out of the
/// issue feed but remain queryable for stats/history. `purge` is the only
/// destructive path — it hard-deletes the runs, launch tasks, their steps, and
/// every linked child row. Both run in a single transaction so a partial clean
/// can never be observed.
pub trait IssueCleanRepo: Send + Sync {
    /// Stamp `archived_at = now` on every non-archived run + launch task linked
    /// to `issue_identifier`. Idempotent — already-archived rows are skipped.
    fn archive_issue(
        &self,
        issue_identifier: &str,
        now: DateTime<Utc>,
    ) -> impl Future<Output = Result<IssueCleanOutcome>> + Send;

    /// Hard-delete every run + launch task (and their steps/events/linked child
    /// rows) for `issue_identifier`. Destructive and irreversible.
    fn purge_issue(
        &self,
        issue_identifier: &str,
    ) -> impl Future<Output = Result<IssueCleanOutcome>> + Send;
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

/// Object-safe shim over [`IssueWorkspaceContextRepo`]. The parent trait
/// uses `impl Future` in return position so it is not object-safe; this
/// alias boxes each future so callers can pass an
/// `Arc<dyn IssueWorkspaceContextRepoDyn>` instead of carrying the concrete
/// generic parameter through their state.
pub trait IssueWorkspaceContextRepoDyn: Send + Sync {
    fn find_latest_by_linear_issue_id<'a>(
        &'a self,
        linear_issue_id: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Option<IssueWorkspaceContext>>> + Send + 'a>>;

    fn list_by_issue_identifier<'a>(
        &'a self,
        identifier: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<IssueWorkspaceContext>>> + Send + 'a>>;

    fn insert_with_children<'a>(
        &'a self,
        context: &'a IssueWorkspaceContext,
        excerpts: &'a [IssueWorkspaceContextCommentExcerpt],
        links: &'a [IssueWorkspaceContextLink],
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send + 'a>>;

    fn list_excerpts<'a>(
        &'a self,
        workspace_context_id: IssueWorkspaceContextId,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<IssueWorkspaceContextCommentExcerpt>>> + Send + 'a>>;

    fn list_links<'a>(
        &'a self,
        workspace_context_id: IssueWorkspaceContextId,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<IssueWorkspaceContextLink>>> + Send + 'a>>;
}

impl<T: IssueWorkspaceContextRepo + ?Sized> IssueWorkspaceContextRepoDyn for T {
    fn find_latest_by_linear_issue_id<'a>(
        &'a self,
        linear_issue_id: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Option<IssueWorkspaceContext>>> + Send + 'a>> {
        Box::pin(IssueWorkspaceContextRepo::find_latest_by_linear_issue_id(
            self,
            linear_issue_id,
        ))
    }

    fn list_by_issue_identifier<'a>(
        &'a self,
        identifier: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<IssueWorkspaceContext>>> + Send + 'a>> {
        Box::pin(IssueWorkspaceContextRepo::list_by_issue_identifier(
            self, identifier,
        ))
    }

    fn insert_with_children<'a>(
        &'a self,
        context: &'a IssueWorkspaceContext,
        excerpts: &'a [IssueWorkspaceContextCommentExcerpt],
        links: &'a [IssueWorkspaceContextLink],
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send + 'a>> {
        Box::pin(IssueWorkspaceContextRepo::insert_with_children(
            self, context, excerpts, links,
        ))
    }

    fn list_excerpts<'a>(
        &'a self,
        workspace_context_id: IssueWorkspaceContextId,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<IssueWorkspaceContextCommentExcerpt>>> + Send + 'a>>
    {
        Box::pin(IssueWorkspaceContextRepo::list_excerpts(
            self,
            workspace_context_id,
        ))
    }

    fn list_links<'a>(
        &'a self,
        workspace_context_id: IssueWorkspaceContextId,
    ) -> Pin<Box<dyn Future<Output = Result<Vec<IssueWorkspaceContextLink>>> + Send + 'a>> {
        Box::pin(IssueWorkspaceContextRepo::list_links(
            self,
            workspace_context_id,
        ))
    }
}

/// Object-safe shim over [`MemoryEntryRepo`]. Same rationale as
/// [`IssueWorkspaceContextRepoDyn`].
pub trait MemoryEntryRepoDyn: Send + Sync {
    fn append<'a>(
        &'a self,
        entry: &'a MemoryEntry,
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send + 'a>>;

    fn list_page<'a>(
        &'a self,
        context_id: IssueWorkspaceContextId,
        cursor: Option<MemoryCursor>,
        limit: u32,
    ) -> Pin<Box<dyn Future<Output = Result<MemoryPage>> + Send + 'a>>;
}

impl<T: MemoryEntryRepo + ?Sized> MemoryEntryRepoDyn for T {
    fn append<'a>(
        &'a self,
        entry: &'a MemoryEntry,
    ) -> Pin<Box<dyn Future<Output = Result<()>> + Send + 'a>> {
        Box::pin(MemoryEntryRepo::append(self, entry))
    }

    fn list_page<'a>(
        &'a self,
        context_id: IssueWorkspaceContextId,
        cursor: Option<MemoryCursor>,
        limit: u32,
    ) -> Pin<Box<dyn Future<Output = Result<MemoryPage>> + Send + 'a>> {
        Box::pin(MemoryEntryRepo::list_page(self, context_id, cursor, limit))
    }
}

/// Repository for the derived `RunContextSnapshot` projection (SUP-187).
///
/// A regenerable cache, not a source of truth: `upsert` keeps one current
/// snapshot per launch task, replacing any prior row.
pub trait RunContextSnapshotRepo: Send + Sync {
    /// Insert or replace the current snapshot for its launch task. Idempotent —
    /// re-deriving and upserting the same task overwrites the prior row.
    fn upsert(&self, snapshot: &RunContextSnapshot) -> impl Future<Output = Result<()>> + Send;

    /// Read the persisted snapshot for a launch task, or `None` if one has
    /// never been generated.
    fn get_by_launch_task(
        &self,
        launch_task_id: LaunchTaskId,
    ) -> impl Future<Output = Result<Option<RunContextSnapshot>>> + Send;
}

/// Repository for `LaunchTaskIntervention` rows (SUP-154).
///
/// Kept as a sibling of `LaunchTaskRepo` rather than folded into it: the
/// SUP-118 launch-task contract is already large, and interventions are a
/// distinct lifecycle (insert / list-pending / mark-consumed) with their own
/// table. The read+mark-consumed split is deliberate — the runtime injects
/// pending rows into the prompt *before* spawning, then marks them consumed
/// only after the agent process is up. Combining the two operations into
/// one transaction would silently drop interventions when spawn fails.
pub trait LaunchTaskInterventionRepo: Send + Sync {
    fn insert(
        &self,
        intervention: &LaunchTaskIntervention,
    ) -> impl Future<Output = Result<()>> + Send;

    fn get(
        &self,
        id: LaunchTaskInterventionId,
    ) -> impl Future<Output = Result<Option<LaunchTaskIntervention>>> + Send;

    /// Every intervention attached to a task, ordered by `created_at` ascending.
    /// Used by the API aggregate to render the operator-facing history.
    fn list_by_task(
        &self,
        task_id: LaunchTaskId,
    ) -> impl Future<Output = Result<Vec<LaunchTaskIntervention>>> + Send;

    /// Read-only: every pending intervention applicable to `step_id` (rows
    /// with `consumed_at IS NULL` whose `target_step_id` is NULL or equals
    /// `step_id`), ordered by `created_at`. Called at step-start to build
    /// the prompt before spawning.
    fn list_pending_for_step(
        &self,
        task_id: LaunchTaskId,
        step_id: LaunchTaskStepId,
    ) -> impl Future<Output = Result<Vec<LaunchTaskIntervention>>> + Send;

    /// Atomically stamp `consumed_at = at` on the rows whose ids are in
    /// `ids`. The `WHERE consumed_at IS NULL` guard prevents double-consume
    /// if a concurrent writer (e.g. retry path) beat us. Returns the rows
    /// actually updated so callers can publish the matching SSE events.
    fn mark_consumed(
        &self,
        ids: &[LaunchTaskInterventionId],
        at: DateTime<Utc>,
    ) -> impl Future<Output = Result<Vec<LaunchTaskInterventionId>>> + Send;
}

/// App-managed provider settings (one editable row per provider).
pub trait ProviderSettingsRepo: Send + Sync {
    fn list(&self) -> impl Future<Output = Result<Vec<ProviderSettings>>> + Send;
    fn get(
        &self,
        provider: AgentProvider,
    ) -> impl Future<Output = Result<Option<ProviderSettings>>> + Send;
    /// Full upsert — used by the PATCH endpoint. Overwrites the editable columns.
    fn upsert(&self, settings: &ProviderSettings) -> impl Future<Output = Result<()>> + Send;
    /// Insert only if the provider row is absent. Used by `seed_defaults` so a
    /// reboot never clobbers operator edits.
    fn insert_if_absent(
        &self,
        settings: &ProviderSettings,
    ) -> impl Future<Output = Result<()>> + Send;
}

/// App-managed, editable skill definitions.
pub trait SkillDefinitionRepo: Send + Sync {
    fn list(&self) -> impl Future<Output = Result<Vec<SkillDefinition>>> + Send;
    fn get(&self, id: &str) -> impl Future<Output = Result<Option<SkillDefinition>>> + Send;
    fn upsert(&self, skill: &SkillDefinition) -> impl Future<Output = Result<()>> + Send;
    fn insert_if_absent(&self, skill: &SkillDefinition) -> impl Future<Output = Result<()>> + Send;
    /// Backfill `body`/`artifact_kind` onto a pre-`body` builtin row, but only
    /// while its `body` is still NULL — guards operator edits from a re-seed.
    fn backfill_builtin_body(
        &self,
        skill: &SkillDefinition,
    ) -> impl Future<Output = Result<()>> + Send;
    fn delete(&self, id: &str) -> impl Future<Output = Result<()>> + Send;
}

/// App-managed, editable agent definitions. Keyed by `name` (a slug), mirroring
/// [`SkillDefinitionRepo`]. Builtins are seeded as editable rows but blocked
/// from deletion at the handler layer (`AgentDefinition::is_deletable`).
pub trait AgentDefinitionRepo: Send + Sync {
    fn list(&self) -> impl Future<Output = Result<Vec<CoreAgentDefinition>>> + Send;
    fn get(&self, name: &str) -> impl Future<Output = Result<Option<CoreAgentDefinition>>> + Send;
    /// Full upsert — used by the create/patch endpoints.
    fn upsert(&self, agent: &CoreAgentDefinition) -> impl Future<Output = Result<()>> + Send;
    /// Insert only if the agent name is absent. Used by `seed_defaults` (builtins
    /// + YAML merge) so a reboot never clobbers operator edits.
    fn insert_if_absent(
        &self,
        agent: &CoreAgentDefinition,
    ) -> impl Future<Output = Result<()>> + Send;
    fn delete(&self, name: &str) -> impl Future<Output = Result<()>> + Send;
}

/// Which builtin catalog a tombstone belongs to. The seeder re-inserts any
/// builtin whose key is absent, so a hard delete records a tombstone here and
/// the seeder skips it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuiltinKind {
    Agent,
    Skill,
}

impl BuiltinKind {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Agent => "agent",
            Self::Skill => "skill",
        }
    }
}

/// Persistent record of builtin agents/skills the operator has permanently
/// deleted. Consulted by `seed_defaults` so a deleted builtin does not reappear
/// on the next boot.
pub trait BuiltinDeletionRepo: Send + Sync {
    /// Tombstone a builtin so the seeder never re-inserts it.
    fn record(&self, kind: BuiltinKind, key: &str) -> impl Future<Output = Result<()>> + Send;
    /// Clear a tombstone (used when a builtin is restored to defaults).
    fn clear(&self, kind: BuiltinKind, key: &str) -> impl Future<Output = Result<()>> + Send;
    /// The set of tombstoned keys for one catalog.
    fn deleted_keys(
        &self,
        kind: BuiltinKind,
    ) -> impl Future<Output = Result<std::collections::HashSet<String>>> + Send;
}

/// Editable launch profiles plus their ordered steps. `upsert`/`get`/
/// `list` carry the steps; the repo writes profile + steps atomically.
pub trait LaunchProfileRepo: Send + Sync {
    fn list(&self) -> impl Future<Output = Result<Vec<LaunchProfile>>> + Send;
    fn get(&self, id: &str) -> impl Future<Output = Result<Option<LaunchProfile>>> + Send;
    /// Replace the profile row and its full step list in one transaction.
    fn upsert(&self, profile: &LaunchProfile) -> impl Future<Output = Result<()>> + Send;
    /// Insert profile + steps only if the profile id is absent (seed path).
    fn insert_if_absent(&self, profile: &LaunchProfile) -> impl Future<Output = Result<()>> + Send;
    fn delete(&self, id: &str) -> impl Future<Output = Result<()>> + Send;
    /// Profiles with a step referencing `skill_ref`, for the delete-warning path.
    fn profiles_using_skill(
        &self,
        skill_ref: &str,
    ) -> impl Future<Output = Result<Vec<ProfileUsage>>> + Send;
    /// Profiles with a step referencing `agent_ref`, for the delete-warning path.
    fn profiles_using_agent(
        &self,
        agent_ref: &str,
    ) -> impl Future<Output = Result<Vec<ProfileUsage>>> + Send;
}
