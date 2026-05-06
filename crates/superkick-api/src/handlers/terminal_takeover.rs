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
    ActiveTakeover, ForceTakeoverSubMode, OpenedTakeover, Run, RunId, TakeoverMode,
    TakeoverModeAvailability, TakeoverModeKind, TakeoverSessionId,
};
use superkick_runtime::RunChatSnapshot;
use superkick_runtime::cli_resume::{inspect_shell_command, interactive_command, resume_supported};
use superkick_storage::repo::RunRepo;

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
    let snapshot = state.conversation_runner.run_chat_snapshot(run_id).await?;

    let spawn_kind = resolve_spawn_kind(&body.mode)?;

    if matches!(body.mode, TakeoverMode::ForceTakeover { .. }) {
        // Cancels (and synchronously marks terminal) the active protocol
        // turn. Returns `NoActiveTurn → 409` when nothing is in flight.
        state
            .conversation_runner
            .force_cancel_active_turn(run_id)
            .await?;
    }

    let worktree = require_worktree(&run)?;
    let provider = snapshot.provider;
    let resume_session_id = snapshot.provider_session_id.as_deref();

    let (command, resume_attempted) = match spawn_kind {
        SpawnKind::Inspect => (inspect_shell_command(worktree), false),
        SpawnKind::Continuation => {
            let allow_resume = resume_supported(provider) && resume_session_id.is_some();
            interactive_command(
                provider,
                worktree,
                if allow_resume {
                    resume_session_id
                } else {
                    None
                },
            )
        }
    };

    let mode_kind = body.mode.kind();
    let spawned = state
        .terminal_takeover_service
        .open(
            run_id,
            worktree,
            command,
            mode_kind,
            resume_attempted,
            body.operator_id,
        )
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
