//! Terminal takeover service (SUP-101).
//!
//! Spawns a dedicated PTY for an operator-initiated takeover, registers it
//! against the run in the shared `PtySessionRegistry`, and writes the
//! corresponding `TerminalTakeoverOpened` / `TerminalTakeoverClosed` events to
//! the run's ledger. Cancellation of the active protocol turn (the
//! `force_takeover` mode) is performed by the API handler via
//! `ConversationRunner::force_cancel_active_turn` *before* it calls this
//! service — keeping the service narrow lets us avoid pulling the (generic)
//! runner type into the takeover code.

use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use anyhow::Result;
use chrono::Utc;
use portable_pty::CommandBuilder;
use tracing::warn;

use superkick_core::{
    ActiveTakeover, EventKind, EventLevel, OpenedTakeover, RunEvent, RunId, TakeoverModeKind,
    TakeoverPath, TakeoverSessionId,
};
use superkick_storage::repo::RunEventRepo;

use crate::agent_supervisor::process::{
    SpawnedPty, open_pty_and_spawn, spawn_initial_input_injection,
};
use crate::pty_io::read_pty_raw;
use crate::pty_session::{PtySessionRegistry, TakeoverEntry};

/// Outcome of a takeover spawn — what the service hands back to the handler.
pub struct SpawnedTakeover {
    pub takeover_session_id: TakeoverSessionId,
    pub mode: TakeoverModeKind,
    pub takeover_path: TakeoverPath,
}

impl SpawnedTakeover {
    /// Build the wire-shaped response. The `terminal_ws` URL depends on the
    /// path: `Attach` joins the run's primary terminal (no takeover PTY was
    /// spawned), while `Resume`/`Fresh` point at the dedicated takeover PTY.
    pub fn into_opened(self, run_id: RunId) -> OpenedTakeover {
        let terminal_ws = match self.takeover_path {
            TakeoverPath::Attach => format!("/api/runs/{run_id}/terminal"),
            TakeoverPath::Resume | TakeoverPath::Fresh => {
                format!("/api/runs/{}/terminal/{}", run_id, self.takeover_session_id)
            }
        };
        OpenedTakeover {
            takeover_session_id: self.takeover_session_id,
            mode: self.mode,
            takeover_path: self.takeover_path,
            terminal_ws,
        }
    }
}

/// Inputs for spawning a takeover PTY, bundled so the spawn path takes one
/// argument instead of a long positional list.
pub struct OpenTakeoverParams<'a> {
    pub run_id: RunId,
    pub cwd: &'a Path,
    pub command: CommandBuilder,
    pub mode: TakeoverModeKind,
    pub takeover_path: TakeoverPath,
    pub opening_context: Option<String>,
    pub operator_id: Option<String>,
}

/// Thin facade around the `PtySessionRegistry` + `RunEventRepo` for takeover
/// lifecycle. Stateless beyond the two `Arc`s; safe to clone.
#[derive(Clone)]
pub struct TerminalTakeoverService<E> {
    registry: Arc<PtySessionRegistry>,
    event_repo: Arc<E>,
}

impl<E> TerminalTakeoverService<E>
where
    E: RunEventRepo + 'static,
{
    pub fn new(registry: Arc<PtySessionRegistry>, event_repo: Arc<E>) -> Self {
        Self {
            registry,
            event_repo,
        }
    }

    /// Spawn a takeover PTY in `cwd`, register it against `run_id`, and emit
    /// `TerminalTakeoverOpened`. The caller is responsible for building the
    /// `CommandBuilder` (typically via the helpers in `cli_resume`) so the
    /// service stays provider-agnostic.
    ///
    /// `takeover_path` records the honest outcome (`Resume` vs `Fresh`);
    /// `opening_context`, when present, is injected into the PTY after spawn as
    /// the opening message — the redacted `RunContextSnapshot` block on the
    /// fresh path. Reads/writes no run/step/queue state.
    pub async fn open(&self, params: OpenTakeoverParams<'_>) -> Result<SpawnedTakeover> {
        let OpenTakeoverParams {
            run_id,
            cwd,
            command,
            mode,
            takeover_path,
            opening_context,
            operator_id,
        } = params;
        let takeover_id = TakeoverSessionId::new();
        let now = Utc::now();

        let spawn = spawn_takeover_pty(run_id, cwd, command)?;
        let pty_session = spawn.session;
        let inject_session = Arc::clone(&pty_session);

        let operator_closed = Arc::new(AtomicBool::new(false));
        let registry = Arc::clone(&self.registry);
        let event_repo = Arc::clone(&self.event_repo);
        let reader = spawn.master_reader;
        let session_for_reader = Arc::clone(&pty_session);
        let broadcast_tx = spawn.broadcast_tx;
        let mut child = spawn.child;
        let watchdog_closed = Arc::clone(&operator_closed);

        // Detached watchdog: blocking-read the PTY, wait for the child to
        // exit, then emit `TerminalTakeoverClosed` (unless an operator-driven
        // `close()` already wrote one) and unregister.
        tokio::spawn(async move {
            let session_clone = Arc::clone(&session_for_reader);
            let reader_handle = tokio::task::spawn_blocking(move || {
                read_pty_raw(reader, &session_clone, &broadcast_tx, None, None);
            });

            // portable-pty's `wait()` is blocking — drive it on a blocking
            // worker so we don't stall the runtime.
            let wait_handle = tokio::task::spawn_blocking(move || child.wait());
            let exit_reason = match wait_handle.await {
                Ok(Ok(status)) => format!("process_exited({})", status.exit_code()),
                Ok(Err(err)) => format!("wait_failed({err})"),
                Err(err) => format!("wait_panicked({err})"),
            };

            // Surface a panic in the reader instead of dropping it silently —
            // a swallowed panic would lose EOF and turn this watchdog into a
            // ghost task. We don't fail the takeover on it; the child has
            // already exited.
            if let Err(err) = reader_handle.await {
                warn!(%run_id, %takeover_id, error = %err, "takeover PTY reader task ended abnormally");
            }

            if watchdog_closed.load(Ordering::Acquire) {
                // Operator already wrote the close event and unregistered.
                return;
            }

            registry.unregister_takeover(takeover_id);
            emit_takeover_event(
                &*event_repo,
                run_id,
                EventKind::TerminalTakeoverClosed,
                EventLevel::Info,
                format!("takeover {takeover_id} closed: {exit_reason}"),
                serde_json::json!({
                    "mode": mode,
                    "takeover_session_id": takeover_id,
                    "reason": exit_reason,
                }),
            )
            .await;
        });

        let entry = TakeoverEntry {
            takeover_session_id: takeover_id,
            run_id,
            mode,
            opened_at: now,
            operator_id: operator_id.clone(),
            session: pty_session,
            operator_closed,
        };
        self.registry.register_takeover(entry);

        emit_takeover_event(
            &*self.event_repo,
            run_id,
            EventKind::TerminalTakeoverOpened,
            EventLevel::Info,
            format!("takeover {takeover_id} opened ({mode:?}, {takeover_path:?})"),
            serde_json::json!({
                "mode": mode,
                "takeover_session_id": takeover_id,
                "operator_id": operator_id,
                "takeover_path": takeover_path,
            }),
        )
        .await;

        // Seed the fresh interactive process with the redacted snapshot,
        // best-effort — mirrors the supervisor's initial-prompt injection.
        if let Some(payload) = opening_context {
            let output_rx = inject_session.subscribe();
            spawn_initial_input_injection(inject_session, payload, run_id, output_rx);
        }

        Ok(SpawnedTakeover {
            takeover_session_id: takeover_id,
            mode,
            takeover_path,
        })
    }

    /// Attach to an already-live interactive session. No PTY is spawned: the
    /// operator joins the run's **primary** terminal stream. We still write a
    /// `TerminalTakeoverOpened` event so the ledger and UI reflect the takeover,
    /// and we deliberately do **not** register a takeover entry — closing an
    /// attach must never kill the agent's primary PTY (that would mutate run
    /// state), and `close()` on an unregistered id is a no-op by construction.
    pub async fn attach(&self, run_id: RunId, operator_id: Option<String>) -> SpawnedTakeover {
        let takeover_id = TakeoverSessionId::new();
        emit_takeover_event(
            &*self.event_repo,
            run_id,
            EventKind::TerminalTakeoverOpened,
            EventLevel::Info,
            format!("takeover {takeover_id} attached to live session"),
            serde_json::json!({
                "mode": TakeoverModeKind::InteractiveContinuation,
                "takeover_session_id": takeover_id,
                "operator_id": operator_id,
                "takeover_path": TakeoverPath::Attach,
            }),
        )
        .await;
        SpawnedTakeover {
            takeover_session_id: takeover_id,
            mode: TakeoverModeKind::InteractiveContinuation,
            takeover_path: TakeoverPath::Attach,
        }
    }

    /// Close a takeover by id. The PTY child receives SIGHUP via the
    /// underlying handle's `Drop`, which in turn fires the watchdog task's
    /// `wait()`. We mark the entry operator-closed first so the watchdog
    /// skips its own `TerminalTakeoverClosed` emit — the ledger sees a single
    /// close event tagged with the operator-supplied reason.
    pub async fn close(
        &self,
        takeover_id: TakeoverSessionId,
        reason: Option<String>,
    ) -> Result<()> {
        let Some(entry) = self.registry.get_takeover(takeover_id) else {
            return Ok(());
        };
        let run_id = entry.run_id;
        let mode = entry.mode;

        entry.operator_closed.store(true, Ordering::Release);

        emit_takeover_event(
            &*self.event_repo,
            run_id,
            EventKind::TerminalTakeoverClosed,
            EventLevel::Info,
            format!("takeover {takeover_id} closed by operator"),
            serde_json::json!({
                "mode": mode,
                "takeover_session_id": takeover_id,
                "reason": reason.clone().unwrap_or_else(|| "operator_close".to_string()),
                "source": "operator",
            }),
        )
        .await;

        self.registry.unregister_takeover(takeover_id);
        Ok(())
    }

    /// Snapshot of the takeovers currently active for a run. Wire-friendly:
    /// the underlying `PtySession` is intentionally not exposed.
    pub fn list_active(&self, run_id: RunId) -> Vec<ActiveTakeover> {
        self.registry
            .list_takeovers_for_run(run_id)
            .into_iter()
            .map(|entry| ActiveTakeover {
                takeover_session_id: entry.takeover_session_id,
                mode: entry.mode,
                opened_at: entry.opened_at,
                operator_id: entry.operator_id,
            })
            .collect()
    }
}

fn spawn_takeover_pty(
    run_id: RunId,
    cwd: &Path,
    mut command: CommandBuilder,
) -> Result<SpawnedPty> {
    // The CommandBuilder cwd is set by the caller; reapply defensively in
    // case a helper forgets — the worktree anchor is load-bearing for
    // takeovers.
    command.cwd(cwd);

    open_pty_and_spawn(
        run_id,
        command,
        "takeover PTY",
        "failed to spawn takeover PTY command",
    )
}

async fn emit_takeover_event<E: RunEventRepo>(
    repo: &E,
    run_id: RunId,
    kind: EventKind,
    level: EventLevel,
    message: String,
    payload: serde_json::Value,
) {
    let mut event = RunEvent::new(run_id, None, kind, level, message);
    event.payload_json = Some(payload);
    crate::run_events::emit_built_event(repo, &event, "takeover").await;
}
