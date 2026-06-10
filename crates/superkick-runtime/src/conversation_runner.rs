//! Structured chat conversation runner (SUP-100).
//!
//! Drives an operator-issued turn through a `ProtocolAdapter`, persists every
//! `ProtocolEventEnvelope` to `turn_events`, fans live envelopes onto the
//! `TurnEventBus`, and updates the parent conversation's `provider_session_id`
//! the first time a `SessionMeta` is observed so the next turn can resume.
//!
//! Concurrency contract: at most one non-terminal turn per conversation. The
//! API enforces this with `ConversationRunnerError::TurnAlreadyStreaming`
//! when an operator tries to send while another is in flight.
//!
//! The PTY supervisor stays untouched. This runner is the structured path; the
//! terminal-takeover UX continues to drive the same agent through the existing
//! `agent_supervisor::lifecycle`.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use chrono::Utc;
use superkick_integrations::linear::LinearClient;
use thiserror::Error;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;
use tracing::{debug, error, info, warn};

use superkick_core::{
    AgentProvider, Conversation, ConversationId, ConversationSubject, ProtocolEvent,
    ProtocolEventEnvelope, ResumeKey, Run, RunId, Turn, TurnId, TurnRequest,
};
use superkick_storage::repo::{ConversationRepo, RunRepo, TurnEventRepo, TurnRepo};

use crate::linear_context::fetch_issue_context;
use crate::protocol_adapter::{
    ClaudeAdapterOptions, ClaudePermissionMode, ClaudeProtocolAdapter, CodexAdapterOptions,
    CodexProtocolAdapter, ProtocolAdapter,
};
use crate::turn_event_bus::TurnEventBus;

/// Operator-tunable knobs for a single turn. Mirrors the Claude Code
/// terminal's "Mode" + "Model" pickers. `None` = use the adapter default.
///
/// Fields are provider-neutral by name but only Claude consumes both today;
/// Codex ignores `mode` (it has its own sandbox concept) and reads `model`.
#[derive(Debug, Clone, Default)]
pub struct TurnOverrides {
    pub mode: Option<ChatPermissionMode>,
    pub model: Option<String>,
}

/// Operator-facing permission posture, normalised across providers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChatPermissionMode {
    /// Ask the operator before each edit (Claude `default`).
    AskBeforeEdits,
    /// Auto-accept edits but still ask for shell / network (Claude `acceptEdits`).
    EditAutomatically,
    /// Plan-only, no edits (Claude `plan`).
    PlanMode,
    /// Bypass all permission prompts (Claude `bypassPermissions`).
    AutoMode,
}

impl ChatPermissionMode {
    fn to_claude(self) -> ClaudePermissionMode {
        match self {
            Self::AskBeforeEdits => ClaudePermissionMode::Default,
            Self::EditAutomatically => ClaudePermissionMode::AcceptEdits,
            Self::PlanMode => ClaudePermissionMode::Plan,
            Self::AutoMode => ClaudePermissionMode::BypassPermissions,
        }
    }
}

impl std::str::FromStr for ChatPermissionMode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "ask_before_edits" => Ok(Self::AskBeforeEdits),
            "edit_automatically" => Ok(Self::EditAutomatically),
            "plan_mode" => Ok(Self::PlanMode),
            "auto_mode" => Ok(Self::AutoMode),
            other => Err(format!("unknown chat permission mode `{other}`")),
        }
    }
}

/// Errors the runner produces. The HTTP layer maps these to `AppError`
/// variants; the runner stays anyhow-free at its public boundary.
#[derive(Debug, Error)]
pub enum ConversationRunnerError {
    #[error("conversation {0} not found")]
    ConversationNotFound(ConversationId),

    #[error("run {0} for conversation subject not found")]
    RunNotFound(RunId),

    #[error("turn {0} not found")]
    TurnNotFound(TurnId),

    #[error("conversation {0} already has a non-terminal turn streaming")]
    TurnAlreadyStreaming(ConversationId),

    #[error("run {0} has no active protocol turn to cancel")]
    NoActiveTurn(RunId),

    #[error("provider {0} is not yet supported by the structured chat runner")]
    ProviderUnavailable(AgentProvider),

    #[error("storage error: {0}")]
    Storage(#[source] anyhow::Error),
}

/// Snapshot of a run's chat state, used by the SUP-101 terminal-takeover
/// handler to decide which modes are available without re-implementing the
/// "find the active conversation/turn for a run" lookup.
///
/// Produced by [`ConversationRunner::run_chat_snapshot`].
#[derive(Debug, Clone)]
pub struct RunChatSnapshot {
    /// Provider for the most recent run-scoped conversation. Defaults to
    /// `Claude` when no conversation exists yet (the UI will see no resume
    /// key and surface "Resume not supported" until a turn lands).
    pub provider: AgentProvider,
    /// Resume key from the most recent conversation, when one is on file.
    pub provider_session_id: Option<String>,
    /// `true` when one of the run's conversations has a non-terminal turn.
    pub has_active_turn: bool,
    /// `true` when at least one run-scoped conversation exists.
    pub has_conversation: bool,
}

/// Transport-agnostic items yielded by `ConversationRunner::stream_turn`.
/// The HTTP layer maps these to SSE `Event`s; other transports map differently.
#[derive(Debug, Clone)]
pub enum TurnStreamItem {
    Envelope(ProtocolEventEnvelope),
    Lagged(u64),
    Done,
    Error,
}

/// Adapter registry — base options reused across turns. Per-turn knobs
/// (`mode`, `model`) come from `TurnOverrides` and are folded in when
/// constructing the adapter for a given turn.
#[derive(Clone, Default)]
pub struct ConversationAdapters {
    pub claude_base: ClaudeAdapterOptions,
    pub codex_base: CodexAdapterOptions,
}

/// Runtime service that owns the lifecycle of a structured chat turn.
pub struct ConversationRunner<C, T, E, R> {
    conversations: Arc<C>,
    turns: Arc<T>,
    turn_events: Arc<E>,
    run_repo: Arc<R>,
    bus: Arc<TurnEventBus>,
    adapters: ConversationAdapters,
    /// Default workdir for issue-scoped turns (no run worktree to anchor to).
    /// Picked at boot from the API config — the operator's main repo path.
    default_workdir: PathBuf,
    /// Optional Linear client. When present, the runner builds an
    /// `IssueContext` snapshot and prepends it to the FIRST turn so the
    /// agent has the issue title / description / comments instead of being
    /// asked to converse blind. `None` when `LINEAR_API_KEY` isn't set —
    /// the runner falls back to a minimal identifier-only header.
    linear_client: Option<Arc<LinearClient>>,
    /// Cancellation tokens for in-flight turns, keyed by `TurnId`. Populated
    /// when `spawn_turn_task` starts a turn and cleared when the runner task
    /// exits. Used by `cancel_turn` (and SUP-101 force-takeover) so the
    /// adapter pump observes the cancellation immediately, not just the DB
    /// row flip.
    active_turns: Arc<Mutex<HashMap<TurnId, CancellationToken>>>,
}

impl<C, T, E, R> ConversationRunner<C, T, E, R>
where
    C: ConversationRepo + 'static,
    T: TurnRepo + 'static,
    E: TurnEventRepo + 'static,
    R: RunRepo + 'static,
{
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        conversations: Arc<C>,
        turns: Arc<T>,
        turn_events: Arc<E>,
        run_repo: Arc<R>,
        bus: Arc<TurnEventBus>,
        adapters: ConversationAdapters,
        default_workdir: PathBuf,
        linear_client: Option<Arc<LinearClient>>,
    ) -> Self {
        Self {
            conversations,
            turns,
            turn_events,
            run_repo,
            bus,
            adapters,
            default_workdir,
            linear_client,
            active_turns: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Look up the active (non-terminal) turn for a run, if any. SUP-101
    /// force-takeover uses this to find what to cancel before opening a
    /// takeover PTY. Returns `None` when no run-scoped conversation has a
    /// streaming turn.
    pub async fn find_active_turn_for_run(
        &self,
        run_id: RunId,
    ) -> Result<Option<Turn>, ConversationRunnerError> {
        Ok(self.run_chat_snapshot_internal(run_id).await?.active_turn)
    }

    /// Aggregated chat snapshot used by the SUP-101 takeover handler. Single
    /// source of truth for "find the active conversation+turn for a run" so
    /// the HTTP layer can render mode availability without re-implementing
    /// the lookup.
    pub async fn run_chat_snapshot(
        &self,
        run_id: RunId,
    ) -> Result<RunChatSnapshot, ConversationRunnerError> {
        let internal = self.run_chat_snapshot_internal(run_id).await?;
        Ok(RunChatSnapshot {
            provider: internal.provider,
            provider_session_id: internal.provider_session_id,
            has_active_turn: internal.active_turn.is_some(),
            has_conversation: internal.has_conversation,
        })
    }

    async fn run_chat_snapshot_internal(
        &self,
        run_id: RunId,
    ) -> Result<RunChatSnapshotInternal, ConversationRunnerError> {
        let conversations = self
            .conversations
            .list_by_subject(&ConversationSubject::Run { run_id })
            .await
            .map_err(ConversationRunnerError::Storage)?;

        let has_conversation = !conversations.is_empty();
        // `list_by_subject` is ordered created_at DESC; pick the head as the
        // canonical run conversation but still iterate all to find an active
        // turn (a stale conversation may have been superseded but still hold
        // a non-terminal row from a crash).
        let head = conversations.first().cloned();
        let provider = head
            .as_ref()
            .map(|c| c.provider)
            .unwrap_or(AgentProvider::Claude);
        let provider_session_id = head.as_ref().and_then(|c| c.provider_session_id.clone());

        let mut active_turn = None;
        for conversation in conversations {
            if let Some(turn) = self
                .turns
                .find_active_for_conversation(conversation.id)
                .await
                .map_err(ConversationRunnerError::Storage)?
            {
                active_turn = Some(turn);
                break;
            }
        }

        Ok(RunChatSnapshotInternal {
            provider,
            provider_session_id,
            active_turn,
            has_conversation,
        })
    }

    /// Cancel whatever protocol turn is currently active for `run_id`. Used by
    /// the SUP-101 force-takeover path so the HTTP handler stays a thin
    /// adapter — the lookup, the cancel, and the synchronous "row is
    /// terminal" guarantee all live here.
    ///
    /// `cancel_turn` already calls `mark_cancelled` synchronously, so once
    /// this returns the row reflects the cancellation; no polling required.
    pub async fn force_cancel_active_turn(
        &self,
        run_id: RunId,
    ) -> Result<TurnId, ConversationRunnerError> {
        let turn = self
            .find_active_turn_for_run(run_id)
            .await?
            .ok_or(ConversationRunnerError::NoActiveTurn(run_id))?;
        let turn_id = turn.id;
        self.cancel_turn(turn_id).await?;
        Ok(turn_id)
    }

    pub fn bus(&self) -> Arc<TurnEventBus> {
        Arc::clone(&self.bus)
    }

    /// Allocate a `Pending` turn row and spawn the streaming task. Returns
    /// the freshly allocated `Turn` so the API can echo it to the operator.
    /// Fails fast (no spawn) when another turn is already in flight.
    pub async fn start_turn(
        &self,
        conversation_id: ConversationId,
        user_text: String,
        overrides: TurnOverrides,
    ) -> Result<Turn, ConversationRunnerError> {
        let conversation = self
            .conversations
            .get(conversation_id)
            .await
            .map_err(ConversationRunnerError::Storage)?
            .ok_or(ConversationRunnerError::ConversationNotFound(
                conversation_id,
            ))?;

        if let Some(active) = self
            .turns
            .find_active_for_conversation(conversation_id)
            .await
            .map_err(ConversationRunnerError::Storage)?
        {
            warn!(
                conversation_id = %conversation_id,
                active_turn_id = %active.id,
                "rejecting concurrent turn — one streaming turn per conversation"
            );
            return Err(ConversationRunnerError::TurnAlreadyStreaming(
                conversation_id,
            ));
        }

        let (workdir, run_for_subject) = self.resolve_workdir(&conversation).await?;

        let now = Utc::now();
        let turn = self
            .turns
            .create_pending(conversation_id, &user_text, now)
            .await
            .map_err(ConversationRunnerError::Storage)?;

        // First turn (no provider session yet) gets a context preface — the
        // agent otherwise has no idea which issue / run it's tied to.
        // Resumed turns piggy-back on the provider's stored conversation
        // history, so we send only the operator's raw user_text.
        let prompt = if conversation.provider_session_id.is_none() {
            self.build_first_turn_prompt(&conversation, run_for_subject.as_ref(), &user_text)
                .await
        } else {
            user_text.clone()
        };

        self.spawn_turn_task(conversation, turn.clone(), prompt, workdir, overrides);

        Ok(turn)
    }

    /// Build the prompt sent to the adapter on the FIRST turn. We prepend a
    /// short context block (issue identifier, optional Linear snapshot, run
    /// metadata when applicable) and then the operator's raw message. The
    /// preface is plain text — no special tagging — because the protocol
    /// does not separate "system" from "user" content for the resume key
    /// generation, and we want the same string the operator wrote to remain
    /// at the bottom of the prompt for clarity.
    async fn build_first_turn_prompt(
        &self,
        conversation: &Conversation,
        run: Option<&Run>,
        user_text: &str,
    ) -> String {
        let mut preface = String::new();
        preface.push_str("--- Superkick chat context ---\n");
        match &conversation.subject {
            ConversationSubject::Issue { identifier } => {
                preface.push_str(&format!(
                    "You are chatting with the operator about Linear issue {identifier}. \
                     There is no run associated with this conversation yet.\n\n"
                ));
                if let Some(client) = self.linear_client.as_deref() {
                    match fetch_issue_context(client, identifier).await {
                        Ok(ctx) => preface.push_str(&ctx.render_for_prompt()),
                        Err(err) => {
                            warn!(
                                identifier = %identifier,
                                error = %err,
                                "failed to fetch Linear context for chat — proceeding with header only"
                            );
                        }
                    }
                }
            }
            ConversationSubject::Run { run_id } => {
                preface.push_str(&format!(
                    "You are chatting with the operator about Superkick run {run_id}.\n"
                ));
                if let Some(run) = run {
                    preface.push_str(&format!(
                        "Linear issue: {} (id: {})\n",
                        run.issue_identifier, run.issue_id
                    ));
                    if let Some(branch) = &run.branch_name {
                        preface.push_str(&format!("Branch: {branch}\n"));
                    }
                    if let Some(worktree) = &run.worktree_path {
                        preface.push_str(&format!("Worktree: {worktree}\n"));
                    }
                    preface.push('\n');
                    if let Some(client) = self.linear_client.as_deref() {
                        match fetch_issue_context(client, &run.issue_id).await {
                            Ok(ctx) => preface.push_str(&ctx.render_for_prompt()),
                            Err(err) => {
                                warn!(
                                    issue_id = %run.issue_id,
                                    error = %err,
                                    "failed to fetch Linear context for chat — proceeding with header only"
                                );
                            }
                        }
                    }
                }
            }
        }
        preface.push_str("\n--- Operator message ---\n");
        preface.push_str(user_text);
        preface
    }

    /// Cancel an in-flight turn. We trip the registered cancellation token
    /// first so the adapter pump observes the cancel and emits its own
    /// `Cancelled` envelope, then mark the row cancelled defensively (in case
    /// the adapter never gets there) and close the bus.
    pub async fn cancel_turn(&self, turn_id: TurnId) -> Result<(), ConversationRunnerError> {
        let turn = self
            .turns
            .get(turn_id)
            .await
            .map_err(ConversationRunnerError::Storage)?
            .ok_or(ConversationRunnerError::TurnNotFound(turn_id))?;

        if turn.status.is_terminal() {
            return Ok(());
        }

        // Signal the adapter pump. Cloning is fine — `cancel()` is idempotent.
        if let Some(token) = self
            .active_turns
            .lock()
            .expect("bug: active turns lock poisoned")
            .get(&turn_id)
            .cloned()
        {
            token.cancel();
        }

        let now = Utc::now();
        self.turns
            .mark_cancelled(turn_id, "operator", now)
            .await
            .map_err(ConversationRunnerError::Storage)?;
        self.bus.close(turn_id).await;
        Ok(())
    }

    /// Transport-agnostic stream of turn events: replay persisted history,
    /// then live drain off the bus, with lag → storage reconciliation and a
    /// terminal-flush on `RecvError::Closed`. Callers (HTTP/SSE today,
    /// WebSocket/gRPC tomorrow) only adapt `TurnStreamItem` to their wire
    /// shape — the ordering / replay logic stays here.
    pub async fn stream_turn(
        &self,
        turn_id: TurnId,
        last_event_id: Option<u64>,
    ) -> Result<
        impl futures_util::Stream<Item = TurnStreamItem> + use<C, T, E, R>,
        ConversationRunnerError,
    > {
        let turn = self
            .turns
            .get(turn_id)
            .await
            .map_err(ConversationRunnerError::Storage)?
            .ok_or(ConversationRunnerError::TurnNotFound(turn_id))?;

        let turn_events = Arc::clone(&self.turn_events);
        let turns = Arc::clone(&self.turns);
        let bus = Arc::clone(&self.bus);

        let initial_status = turn.status;
        let initial_seq = last_event_id.unwrap_or(0);
        let mut live_rx = bus.subscribe(turn_id).await;

        Ok(async_stream::stream! {
            let mut last_seq = initial_seq;

            let history = if last_event_id.is_some() {
                turn_events.list_by_turn_after(turn_id, last_seq).await
            } else {
                turn_events.list_by_turn(turn_id).await
            };
            let history = match history {
                Ok(events) => events,
                Err(_) => {
                    yield TurnStreamItem::Error;
                    return;
                }
            };
            for event in &history {
                last_seq = event.envelope.seq;
                yield TurnStreamItem::Envelope(event.envelope.clone());
            }

            if initial_status.is_terminal() {
                yield TurnStreamItem::Done;
                return;
            }

            loop {
                match live_rx.recv().await {
                    Ok(envelope) => {
                        if envelope.seq <= last_seq {
                            continue;
                        }
                        last_seq = envelope.seq;
                        let terminal = envelope.event.is_terminal();
                        yield TurnStreamItem::Envelope(envelope);
                        if terminal {
                            yield TurnStreamItem::Done;
                            return;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                        if let Ok(missed) =
                            turn_events.list_by_turn_after(turn_id, last_seq).await
                        {
                            for event in &missed {
                                last_seq = event.envelope.seq;
                                yield TurnStreamItem::Envelope(event.envelope.clone());
                            }
                        } else {
                            yield TurnStreamItem::Error;
                        }
                        yield TurnStreamItem::Lagged(skipped);
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        if let Ok(rest) =
                            turn_events.list_by_turn_after(turn_id, last_seq).await
                        {
                            for event in &rest {
                                yield TurnStreamItem::Envelope(event.envelope.clone());
                            }
                        }
                        if let Ok(Some(t)) = turns.get(turn_id).await
                            && t.status.is_terminal()
                        {
                            yield TurnStreamItem::Done;
                        }
                        return;
                    }
                }
            }
        })
    }

    async fn resolve_workdir(
        &self,
        conversation: &Conversation,
    ) -> Result<(PathBuf, Option<Run>), ConversationRunnerError> {
        match &conversation.subject {
            ConversationSubject::Issue { .. } => Ok((self.default_workdir.clone(), None)),
            ConversationSubject::Run { run_id } => {
                let run = self
                    .run_repo
                    .get(*run_id)
                    .await
                    .map_err(ConversationRunnerError::Storage)?
                    .ok_or(ConversationRunnerError::RunNotFound(*run_id))?;
                let path = run
                    .worktree_path
                    .clone()
                    .map(PathBuf::from)
                    .unwrap_or_else(|| self.default_workdir.clone());
                Ok((path, Some(run)))
            }
        }
    }

    fn spawn_turn_task(
        &self,
        conversation: Conversation,
        turn: Turn,
        user_text: String,
        workdir: PathBuf,
        overrides: TurnOverrides,
    ) -> JoinHandle<()> {
        let conversations = Arc::clone(&self.conversations);
        let turns = Arc::clone(&self.turns);
        let turn_events = Arc::clone(&self.turn_events);
        let bus = Arc::clone(&self.bus);
        let adapters = self.adapters.clone();
        let active_turns = Arc::clone(&self.active_turns);

        // External cancel handle for SUP-101 force-takeover (and any caller
        // of `cancel_turn`). Registered before the task is spawned so a
        // racing `cancel_turn` between `start_turn` and the adapter spawn
        // still cancels the in-flight turn, not a phantom future one.
        let outer_cancel = CancellationToken::new();
        active_turns
            .lock()
            .expect("bug: active turns lock poisoned")
            .insert(turn.id, outer_cancel.clone());

        tokio::spawn(async move {
            let request = TurnRequest {
                prompt: user_text,
                workdir,
                options: Default::default(),
            };
            let resume = conversation.provider_session_id.clone().map(ResumeKey::new);

            let result = match conversation.provider {
                AgentProvider::Claude => {
                    let mut options = adapters.claude_base.clone();
                    if let Some(mode) = overrides.mode {
                        options.permission_mode = mode.to_claude();
                    }
                    if overrides.model.is_some() {
                        options.model = overrides.model.clone();
                    }
                    let adapter = ClaudeProtocolAdapter::with_options(options);
                    drive_turn(
                        adapter,
                        request,
                        resume,
                        &conversation,
                        &turn,
                        Arc::clone(&conversations),
                        Arc::clone(&turns),
                        Arc::clone(&turn_events),
                        Arc::clone(&bus),
                        outer_cancel.clone(),
                    )
                    .await
                }
                AgentProvider::Codex => {
                    let mut options = adapters.codex_base.clone();
                    if overrides.model.is_some() {
                        options.model = overrides.model.clone();
                    }
                    let adapter = CodexProtocolAdapter::with_options(options);
                    drive_turn(
                        adapter,
                        request,
                        resume,
                        &conversation,
                        &turn,
                        Arc::clone(&conversations),
                        Arc::clone(&turns),
                        Arc::clone(&turn_events),
                        Arc::clone(&bus),
                        outer_cancel.clone(),
                    )
                    .await
                }
            };

            if let Err(err) = result {
                error!(
                    conversation_id = %conversation.id,
                    turn_id = %turn.id,
                    error = %err,
                    "conversation runner task failed"
                );
                let now = Utc::now();
                if let Err(persist_err) = turns
                    .mark_failed(turn.id, "runner_error", &err.to_string(), None, now)
                    .await
                {
                    error!(
                        turn_id = %turn.id,
                        error = %persist_err,
                        "failed to persist runner_error terminal state"
                    );
                }
                bus.close(turn.id).await;
            }

            // Always deregister, even on error — leaving a stale token would
            // make the next `cancel_turn` for a fresh turn no-op.
            active_turns
                .lock()
                .expect("bug: active turns lock poisoned")
                .remove(&turn.id);
        })
    }
}

#[allow(clippy::too_many_arguments)]
async fn drive_turn<A, C, T, E>(
    adapter: A,
    request: TurnRequest,
    resume: Option<ResumeKey>,
    conversation: &Conversation,
    turn: &Turn,
    conversations: Arc<C>,
    turns: Arc<T>,
    turn_events: Arc<E>,
    bus: Arc<TurnEventBus>,
    outer_cancel: CancellationToken,
) -> Result<()>
where
    A: ProtocolAdapter,
    C: ConversationRepo,
    T: TurnRepo,
    E: TurnEventRepo,
{
    info!(
        conversation_id = %conversation.id,
        turn_id = %turn.id,
        provider = %conversation.provider,
        resuming = resume.is_some(),
        "starting structured turn"
    );

    let stream_result = match resume.clone() {
        Some(key) => adapter.resume_turn(key, request).await,
        None => adapter.start_turn(request).await,
    };
    let mut stream = stream_result.context("adapter start/resume failed")?;

    // Bridge the runner-level cancel token into the adapter's. Wrapped in
    // `AbortOnDrop` so any early `?` return from this function aborts the
    // bridge — `CancellationToken::cancelled()` does NOT complete on drop, so
    // a bare `tokio::spawn` would leak the task until the adapter cancels its
    // inner token on its own shutdown path.
    let inner_cancel = stream.handle.cancel_token();
    let _bridge = AbortOnDrop(tokio::spawn({
        let inner = inner_cancel.clone();
        async move {
            tokio::select! {
                _ = outer_cancel.cancelled() => inner.cancel(),
                _ = inner.cancelled() => {}
            }
        }
    }));

    let started_at = Utc::now();
    turns
        .mark_streaming(turn.id, started_at)
        .await
        .context("mark turn streaming")?;
    conversations
        .set_last_turn_at(conversation.id, started_at)
        .await
        .context("update conversation last_turn_at")?;

    let mut session_id_persisted = false;
    let mut last_usage = None;
    let mut terminal_kind: Option<TerminalKind> = None;

    while let Some(envelope) = stream.events.recv().await {
        debug!(turn_id = %turn.id, seq = envelope.seq, "received protocol envelope");

        // Capture provider session id from the first SessionMeta. We persist
        // before publishing so a refresh of the SSE handler always reads the
        // session id alongside the event that announced it.
        if !session_id_persisted && let ProtocolEvent::SessionMeta(meta) = &envelope.event {
            let key = meta.resume_key.as_str();
            conversations
                .set_provider_session_id(conversation.id, key, Utc::now())
                .await
                .context("persist provider_session_id")?;
            session_id_persisted = true;
        }

        if let ProtocolEvent::Usage(snapshot) = &envelope.event {
            last_usage = Some(snapshot.clone());
        }

        // Order matters here. Frontend behaviour:
        //   SSE handler yields the terminal envelope → emits `done` →
        //   useTurnStream fires onTerminal → ChatPanel calls syncDetail()
        //   → GET /conversations/{id} refetches turns.
        // If we persist the terminal envelope and publish it BEFORE marking
        // the row terminal, the refetch races us and reads `streaming`. So
        // for terminal envelopes we update the DB first, THEN persist the
        // event row, THEN publish on the bus.
        match &envelope.event {
            ProtocolEvent::Completion(c) => {
                if c.usage.is_some() {
                    last_usage = c.usage.clone();
                }
                terminal_kind = Some(TerminalKind::Completed);
            }
            ProtocolEvent::Failure(f) => {
                if f.usage.is_some() {
                    last_usage = f.usage.clone();
                }
                terminal_kind = Some(TerminalKind::Failed {
                    code: f.code.clone(),
                    message: f.message.clone(),
                });
            }
            ProtocolEvent::Cancelled(c) => {
                terminal_kind = Some(TerminalKind::Cancelled {
                    reason: c.reason.clone(),
                });
            }
            _ => {}
        }

        if envelope.event.is_terminal() {
            let now = Utc::now();
            match terminal_kind.as_ref() {
                Some(TerminalKind::Completed) => {
                    turns
                        .mark_completed(turn.id, last_usage.as_ref(), now)
                        .await
                        .context("mark turn completed")?;
                }
                Some(TerminalKind::Failed { code, message }) => {
                    turns
                        .mark_failed(turn.id, code, message, last_usage.as_ref(), now)
                        .await
                        .context("mark turn failed")?;
                }
                Some(TerminalKind::Cancelled { reason }) => {
                    turns
                        .mark_cancelled(turn.id, reason, now)
                        .await
                        .context("mark turn cancelled")?;
                }
                None => {}
            }
        }

        turn_events
            .append(turn.id, &envelope)
            .await
            .context("persist turn event")?;
        bus.publish(turn.id, envelope).await;
    }

    let _outcome = stream.handle.finish().await.context("turn outcome")?;
    // Defensive: if the adapter closed the channel without ever emitting a
    // terminal envelope (a malformed pump shouldn't, but the contract
    // doesn't hard-require one), mark completed so the row never sticks at
    // streaming forever.
    if terminal_kind.is_none() {
        let now = Utc::now();
        turns
            .mark_completed(turn.id, last_usage.as_ref(), now)
            .await
            .context("mark turn completed (no terminal envelope)")?;
    }

    bus.close(turn.id).await;
    Ok(())
}

enum TerminalKind {
    Completed,
    Failed { code: String, message: String },
    Cancelled { reason: String },
}

/// Internal projection that owns the active `Turn` value alongside the public
/// snapshot fields, so [`ConversationRunner::find_active_turn_for_run`] and
/// [`ConversationRunner::run_chat_snapshot`] share one query path without
/// double-fetching the active row.
struct RunChatSnapshotInternal {
    provider: AgentProvider,
    provider_session_id: Option<String>,
    active_turn: Option<Turn>,
    has_conversation: bool,
}

/// Aborts a tokio task on drop. Used to make sure the cancellation-bridge
/// task in `drive_turn` never outlives its parent — early returns from `?`
/// would otherwise leak the bridge until the adapter's inner cancel token
/// fires on its own (which only happens if the adapter cancels it).
struct AbortOnDrop(JoinHandle<()>);

impl Drop for AbortOnDrop {
    fn drop(&mut self) {
        self.0.abort();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn errors_carry_useful_messages() {
        let err = ConversationRunnerError::TurnAlreadyStreaming(ConversationId::new());
        let msg = err.to_string();
        assert!(msg.contains("non-terminal turn streaming"), "got: {msg}");
    }
}
