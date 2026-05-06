//! Structured chat HTTP surface (SUP-100).
//!
//! Mounted under `/api/...` from the dashboard's perspective; Vite rewrites
//! `/api/X` → `/X` on the way to the backend, so the routes below are
//! registered at the bare paths.
//!
//! Endpoints:
//!   POST /conversations                       create (201, never idempotent — SUP-107)
//!   GET  /conversations/{id}                  detail (turns + events)
//!   GET  /conversations?issue_id|run_id=...   list by subject
//!   POST /conversations/{id}/turns            send a turn (202)
//!   POST /conversations/{id}/turns/{t}/cancel cancel an in-flight turn
//!   GET  /turns/{turn_id}/events              SSE replay + live stream

use std::collections::HashMap;
use std::time::Duration;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Json};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};

use superkick_core::{
    AgentProvider, ConversationId, ConversationSubject, RunId, TurnEvent, TurnId,
};
use superkick_runtime::{ChatPermissionMode, TurnOverrides, TurnStreamItem};
use superkick_storage::repo::{ConversationRepo, RunRepo, TurnEventRepo, TurnRepo};

use crate::AppState;
use crate::error::AppError;

#[derive(Debug, Deserialize)]
pub struct CreateConversationRequest {
    pub subject: ConversationSubject,
    pub agent_id: String,
    pub provider: AgentProvider,
}

pub async fn create_conversation(
    State(state): State<AppState>,
    Json(body): Json<CreateConversationRequest>,
) -> Result<impl IntoResponse, AppError> {
    let agent_id = body.agent_id.trim().to_string();
    if agent_id.is_empty() {
        return Err(AppError::BadRequest("agent_id must not be empty".into()));
    }
    // Normalise the issue identifier once at the API edge so persisted
    // values match what `list_conversations` queries with — `list_by_subject`
    // trims its query param, so a `" SUP-107 "` create followed by a
    // `SUP-107` list would otherwise miss its own row.
    let subject = match body.subject {
        ConversationSubject::Issue { identifier } => {
            let trimmed = identifier.trim();
            if trimmed.is_empty() {
                return Err(AppError::BadRequest(
                    "issue identifier must not be empty".into(),
                ));
            }
            ConversationSubject::Issue {
                identifier: trimmed.to_string(),
            }
        }
        ConversationSubject::Run { run_id } => {
            if state.run_repo.get(run_id).await?.is_none() {
                return Err(AppError::NotFound("run not found"));
            }
            ConversationSubject::Run { run_id }
        }
    };

    let now = chrono::Utc::now();
    let conversation = state
        .conversation_repo
        .create(&subject, &agent_id, body.provider, now)
        .await?;
    Ok((StatusCode::CREATED, Json(conversation)))
}

#[derive(Debug, Serialize)]
pub struct ConversationDetail {
    pub conversation: superkick_core::Conversation,
    pub turns: Vec<superkick_core::Turn>,
    pub events_by_turn: HashMap<String, Vec<TurnEvent>>,
}

pub async fn get_conversation(
    State(state): State<AppState>,
    Path(id): Path<uuid::Uuid>,
) -> Result<impl IntoResponse, AppError> {
    let conv_id = ConversationId(id);
    let Some(conversation) = state.conversation_repo.get(conv_id).await? else {
        return Err(AppError::NotFound("conversation not found"));
    };
    let turns = state.turn_repo.list_by_conversation(conv_id).await?;
    let mut events_by_turn = HashMap::with_capacity(turns.len());
    for turn in &turns {
        let events = state.turn_event_repo.list_by_turn(turn.id).await?;
        events_by_turn.insert(turn.id.to_string(), events);
    }
    Ok(Json(ConversationDetail {
        conversation,
        turns,
        events_by_turn,
    }))
}

#[derive(Debug, Deserialize)]
pub struct ListConversationsParams {
    pub issue_id: Option<String>,
    pub run_id: Option<uuid::Uuid>,
}

#[derive(Debug, Serialize)]
pub struct ConversationListEntry {
    #[serde(flatten)]
    pub conversation: superkick_core::Conversation,
    /// First operator prompt for this conversation, if any. The sidebar
    /// renders it (truncated) as the conversation title — much more useful
    /// than a static "Conversation 3" placeholder.
    pub first_user_text: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ListConversationsResponse {
    pub conversations: Vec<ConversationListEntry>,
}

pub async fn list_conversations(
    State(state): State<AppState>,
    Query(params): Query<ListConversationsParams>,
) -> Result<impl IntoResponse, AppError> {
    let subject = match (params.issue_id, params.run_id) {
        (Some(identifier), None) => {
            let trimmed = identifier.trim();
            if trimmed.is_empty() {
                return Err(AppError::BadRequest(
                    "issue_id query param must not be empty".into(),
                ));
            }
            ConversationSubject::Issue {
                identifier: trimmed.to_string(),
            }
        }
        (None, Some(run_id)) => ConversationSubject::Run {
            run_id: RunId(run_id),
        },
        (Some(_), Some(_)) => {
            return Err(AppError::BadRequest(
                "specify issue_id OR run_id, not both".into(),
            ));
        }
        (None, None) => {
            return Err(AppError::BadRequest(
                "specify either issue_id or run_id".into(),
            ));
        }
    };
    let rows = state
        .conversation_repo
        .list_by_subject_with_first_text(&subject)
        .await?;
    let entries = rows
        .into_iter()
        .map(|(conversation, first_user_text)| ConversationListEntry {
            conversation,
            first_user_text,
        })
        .collect();
    Ok(Json(ListConversationsResponse {
        conversations: entries,
    }))
}

#[derive(Debug, Deserialize)]
pub struct CreateTurnRequest {
    pub user_text: String,
    /// Operator-chosen permission posture. Wire format mirrors the Claude
    /// Code terminal labels so the UI can pass the value straight through:
    /// `ask_before_edits` | `edit_automatically` | `plan_mode` | `auto_mode`.
    pub permission_mode: Option<String>,
    /// Optional model alias forwarded to the provider CLI (`--model …`).
    /// `None` = use the CLI's default. Provider-specific aliases are
    /// accepted as-is and not validated server-side.
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateTurnResponse {
    pub turn_id: TurnId,
    pub conversation_id: ConversationId,
    pub status: superkick_core::TurnStatus,
}

pub async fn create_turn(
    State(state): State<AppState>,
    Path(conversation_id): Path<uuid::Uuid>,
    Json(body): Json<CreateTurnRequest>,
) -> Result<impl IntoResponse, AppError> {
    let user_text = body.user_text.trim().to_string();
    if user_text.is_empty() {
        return Err(AppError::BadRequest("user_text must not be empty".into()));
    }
    let mode = body
        .permission_mode
        .as_deref()
        .map(|s| {
            s.parse::<ChatPermissionMode>()
                .map_err(AppError::BadRequest)
        })
        .transpose()?;
    let model = body
        .model
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty());
    let conv_id = ConversationId(conversation_id);
    let turn = state
        .conversation_runner
        .start_turn(conv_id, user_text, TurnOverrides { mode, model })
        .await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(CreateTurnResponse {
            turn_id: turn.id,
            conversation_id: turn.conversation_id,
            status: turn.status,
        }),
    ))
}

pub async fn cancel_turn(
    State(state): State<AppState>,
    Path((_conversation_id, turn_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<impl IntoResponse, AppError> {
    state
        .conversation_runner
        .cancel_turn(TurnId(turn_id))
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// SSE: replay persisted events then push live ones until the turn terminates.
/// Honours `Last-Event-ID` so a reconnecting client picks up after the last
/// seq it saw without re-rendering the full transcript.
///
/// Replay/live ordering, lag recovery, and terminal-flush semantics live in
/// `ConversationRunner::stream_turn` (transport-agnostic). This handler only
/// adapts `TurnStreamItem` to axum's `Event` shape.
pub async fn turn_events_stream(
    State(state): State<AppState>,
    Path(turn_id): Path<uuid::Uuid>,
    headers: axum::http::HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    let turn_id = TurnId(turn_id);
    let last_event_id = headers
        .get(axum::http::header::HeaderName::from_static("last-event-id"))
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<u64>().ok());

    let inner = state
        .conversation_runner
        .stream_turn(turn_id, last_event_id)
        .await?;

    let stream = inner.map(|item| Ok::<Event, std::convert::Infallible>(turn_item_to_event(item)));

    Ok(Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15))))
}

/// Render a runtime `TurnStreamItem` as an SSE `Event`. Errors are surfaced as
/// fixed-string events without leaking internal details (the runtime emits
/// `tracing::error!` at the source).
fn turn_item_to_event(item: TurnStreamItem) -> Event {
    match item {
        TurnStreamItem::Envelope(envelope) => match serde_json::to_string(&envelope) {
            Ok(data) => Event::default()
                .id(envelope.seq.to_string())
                .event("turn_event")
                .data(data),
            Err(err) => {
                tracing::error!(error = ?err, "failed to serialize turn envelope");
                Event::default()
                    .event("error")
                    .data("failed to serialize turn event")
            }
        },
        TurnStreamItem::Lagged(skipped) => {
            Event::default().event("lagged").data(skipped.to_string())
        }
        TurnStreamItem::Done => Event::default().event("done").data("turn finished"),
        TurnStreamItem::Error => Event::default()
            .event("error")
            .data("failed to read turn events"),
    }
}
