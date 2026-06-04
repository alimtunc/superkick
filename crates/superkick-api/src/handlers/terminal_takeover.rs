//! HTTP handlers for SUP-101 terminal takeover.
//!
//! Routes:
//! - `GET    /api/runs/{id}/terminal-takeover/modes`
//! - `POST   /api/runs/{id}/terminal-takeover/open`
//! - `POST   /api/runs/{id}/terminal-takeover/{takeover_id}/close`
//! - `GET    /api/runs/{id}/takeovers`
//!
//! Handlers stay thin: they validate input, delegate aggregate lookups to
//! `ConversationRunner` (mode availability, force-cancel of an active turn),
//! and let `TerminalTakeoverService` own the PTY spawn + ledger writes.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use std::path::Path as StdPath;

use superkick_core::{
    ActiveTakeover, ForceTakeoverSubMode, OpenedTakeover, Run, RunContextSnapshot, RunId,
    TakeoverMode, TakeoverModeAvailability, TakeoverModeKind, TakeoverPath, TakeoverSessionId,
};
use superkick_runtime::cli_resume::{
    inspect_shell_command, interactive_command, resolve_resume_target, resume_supported,
};
use superkick_runtime::{OpenTakeoverParams, RunChatSnapshot, refresh_run_context_snapshot};
use superkick_storage::repo::{LaunchTaskRepo, RunRepo};
use tracing::warn;

use crate::AppState;
use crate::error::AppError;

#[derive(Debug, Serialize)]
pub struct ModesResponse {
    pub modes: Vec<TakeoverModeAvailability>,
}

#[derive(Debug, Deserialize)]
pub struct OpenRequest {
    #[serde(flatten)]
    pub mode: TakeoverMode,
    /// Optional free-form operator id. Stored alongside the takeover entry
    /// and surfaced on the `TerminalTakeoverOpened` event payload.
    pub operator_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ActiveTakeoversResponse {
    pub takeovers: Vec<ActiveTakeover>,
}

/// What the takeover should actually spawn — the rich `TakeoverMode` enum
/// projects onto one of these two shapes after the API has validated
/// `confirm_force` for the destructive path.
enum SpawnKind {
    Inspect,
    Continuation,
}

// ── Handlers ─────────────────────────────────────────────────────────

pub async fn list_modes(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<ModesResponse>, AppError> {
    let run_id = RunId(id);
    let _run = require_run(&state, run_id).await?;
    let snapshot = state.conversation_runner.run_chat_snapshot(run_id).await?;
    Ok(Json(ModesResponse {
        modes: build_availability(&snapshot),
    }))
}

pub async fn open_takeover(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
    Json(body): Json<OpenRequest>,
) -> Result<Json<OpenedTakeover>, AppError> {
    let run_id = RunId(id);
    let run = require_run(&state, run_id).await?;

    let spawn_kind = resolve_spawn_kind(&body.mode)?;
    let is_force = matches!(body.mode, TakeoverMode::ForceTakeover { .. });

    if is_force {
        // Cancels (and synchronously marks terminal) the active protocol
        // turn. Returns `NoActiveTurn → 409` when nothing is in flight.
        state
            .conversation_runner
            .force_cancel_active_turn(run_id)
            .await?;
    }

    // Join an already-live interactive PTY rather than spawn a second CLI. Only
    // interactive runs register a primary session, so headless never matches.
    if matches!(spawn_kind, SpawnKind::Continuation)
        && !is_force
        && state.pty_registry.get(run_id).is_some()
    {
        let spawned = state
            .terminal_takeover_service
            .attach(run_id, body.operator_id)
            .await;
        return Ok(Json(spawned.into_opened(run_id)));
    }

    let worktree = require_worktree(&run)?;

    let (command, takeover_path, opening_context) = match spawn_kind {
        SpawnKind::Inspect => (inspect_shell_command(worktree), TakeoverPath::Fresh, None),
        SpawnKind::Continuation => {
            // The launch-task snapshot is the honest resume target + injection
            // source; a plain chat run has none (falls back to its conversation).
            let chat = state.conversation_runner.run_chat_snapshot(run_id).await?;
            let snapshot = load_run_snapshot(&state, run_id).await;
            let (provider, resume_session_id) =
                resolve_resume_target(&chat, snapshot.as_ref().map(|s| &s.provider));
            let allow_resume = resume_supported(provider) && resume_session_id.is_some();
            let (command, resumed) = interactive_command(
                provider,
                worktree,
                if allow_resume {
                    resume_session_id.as_deref()
                } else {
                    None
                },
            );
            if resumed {
                // Provider restores history on resume; inject only a short header
                // so the operator still sees which task this terminal is.
                let header = snapshot
                    .as_ref()
                    .map(RunContextSnapshot::render_takeover_header);
                (command, TakeoverPath::Resume, header)
            } else {
                // Fresh spawn: inject the full redacted snapshot when one exists.
                let block = snapshot
                    .as_ref()
                    .map(RunContextSnapshot::render_for_takeover);
                (command, TakeoverPath::Fresh, block)
            }
        }
    };

    let spawned = state
        .terminal_takeover_service
        .open(OpenTakeoverParams {
            run_id,
            cwd: worktree,
            command,
            mode: body.mode.kind(),
            takeover_path,
            opening_context,
            operator_id: body.operator_id,
        })
        .await
        .map_err(AppError::Internal)?;

    Ok(Json(spawned.into_opened(run_id)))
}

pub async fn close_takeover(
    State(state): State<AppState>,
    Path((run_id, takeover_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<StatusCode, AppError> {
    let run_id = RunId(run_id);
    let takeover_id = TakeoverSessionId(takeover_id);
    require_run(&state, run_id).await?;

    state
        .terminal_takeover_service
        .close(takeover_id, Some("operator_close".to_string()))
        .await
        .map_err(AppError::Internal)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_active(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<ActiveTakeoversResponse>, AppError> {
    let run_id = RunId(id);
    require_run(&state, run_id).await?;
    let takeovers = state.terminal_takeover_service.list_active(run_id);
    Ok(Json(ActiveTakeoversResponse { takeovers }))
}

// ── Internal helpers ─────────────────────────────────────────────────

/// Load the redacted `RunContextSnapshot` for the launch task backing this
/// shadow run. A plain chat run (no linked launch task) yields `None`. On a
/// lookup or refresh error this logs and returns `None` so the takeover still
/// opens — injected context is best-effort, never a gate on the operator's
/// escape hatch. The only write is the regenerable snapshot cache upsert.
async fn load_run_snapshot(state: &AppState, run_id: RunId) -> Option<RunContextSnapshot> {
    let step = match state.launch_task_repo.find_step_by_linked_run(run_id).await {
        Ok(Some(step)) => step,
        Ok(None) => return None,
        Err(err) => {
            warn!(%run_id, error = %err, "takeover: launch-task lookup failed; opening without snapshot context");
            return None;
        }
    };
    match refresh_run_context_snapshot(
        state.launch_task_repo.as_ref(),
        state.run_repo.as_ref(),
        state.session_repo.as_ref(),
        state.event_repo.as_ref(),
        state.issue_workspace_context_repo.as_ref(),
        state.run_context_snapshot_repo.as_ref(),
        step.launch_task_id,
        chrono::Utc::now(),
    )
    .await
    {
        Ok(snapshot) => Some(snapshot),
        Err(err) => {
            warn!(%run_id, error = %err, "takeover: snapshot refresh failed; opening without context");
            None
        }
    }
}

fn resolve_spawn_kind(mode: &TakeoverMode) -> Result<SpawnKind, AppError> {
    match mode {
        TakeoverMode::Inspect => Ok(SpawnKind::Inspect),
        TakeoverMode::InteractiveContinuation => Ok(SpawnKind::Continuation),
        TakeoverMode::ForceTakeover {
            sub_mode,
            confirm_force,
        } => {
            if !confirm_force {
                return Err(AppError::BadRequest(
                    "force_takeover requires confirm_force=true".to_string(),
                ));
            }
            match sub_mode {
                ForceTakeoverSubMode::Inspect => Ok(SpawnKind::Inspect),
                ForceTakeoverSubMode::InteractiveContinuation => Ok(SpawnKind::Continuation),
            }
        }
    }
}

fn build_availability(snapshot: &RunChatSnapshot) -> Vec<TakeoverModeAvailability> {
    let resume = resume_supported(snapshot.provider) && snapshot.provider_session_id.is_some();
    let no_turn_reason = if snapshot.has_conversation {
        "no active turn".to_string()
    } else {
        "no run-scoped conversation".to_string()
    };
    vec![
        TakeoverModeAvailability {
            mode: TakeoverModeKind::Inspect,
            available: true,
            reason: None,
            resume_supported: false,
        },
        TakeoverModeAvailability {
            mode: TakeoverModeKind::InteractiveContinuation,
            available: true,
            reason: None,
            resume_supported: resume,
        },
        TakeoverModeAvailability {
            mode: TakeoverModeKind::ForceTakeover,
            available: snapshot.has_active_turn,
            reason: if snapshot.has_active_turn {
                None
            } else {
                Some(no_turn_reason)
            },
            resume_supported: false,
        },
    ]
}

async fn require_run(state: &AppState, run_id: RunId) -> Result<Run, AppError> {
    state
        .run_repo
        .get(run_id)
        .await?
        .ok_or(AppError::NotFound("run not found"))
}

fn require_worktree(run: &Run) -> Result<&StdPath, AppError> {
    match &run.worktree_path {
        Some(path) => Ok(StdPath::new(path)),
        None => Err(AppError::BadRequest(
            "run has no worktree path; takeovers require a worktree-anchored run".to_string(),
        )),
    }
}
