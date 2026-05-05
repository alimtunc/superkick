//! Structured agent chat conversations (SUP-100).
//!
//! A conversation is a durable transcript of operator ↔ agent turns scoped to
//! either an issue or a run. It sits above the SUP-97 `ProtocolAdapter`: each
//! turn drives `start_turn` / `resume_turn`, the resulting event stream is
//! persisted as `TurnEvent`s, and the provider session id is captured on the
//! conversation so the next turn can resume.
//!
//! The PTY substrate is unaffected — terminal-takeover keeps its own UX. This
//! module is the structured alternative for chat-style interaction.
//!
//! Design notes:
//!
//! - `ConversationSubject` is polymorphic but deliberately closed (issue or
//!   run, exactly one). The storage layer enforces "at most one of" via a
//!   CHECK constraint; the type carries that invariant in code.
//! - `TurnEvent` re-uses `ProtocolEventEnvelope` directly (instead of
//!   redefining variants) so persistence is 1:1 with the wire stream — no
//!   double schema to keep in sync when the protocol grows new event kinds.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::agent::AgentProvider;
use crate::id::{ConversationId, RunId, TurnEventId, TurnId};
use crate::protocol::{ProtocolEventEnvelope, UsageSnapshot};

/// Subject the conversation is anchored to — either a Linear issue
/// identifier (`SUP-42`) or a run id. A conversation never floats free.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ConversationSubject {
    Issue { identifier: String },
    Run { run_id: RunId },
}

/// Lifecycle status of a conversation as a whole. Today only `Active` is
/// produced; `Archived` is reserved so the API contract can evolve without a
/// migration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConversationStatus {
    Active,
    Archived,
}

impl std::fmt::Display for ConversationStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Active => "active",
            Self::Archived => "archived",
        };
        f.write_str(s)
    }
}

impl std::str::FromStr for ConversationStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "active" => Ok(Self::Active),
            "archived" => Ok(Self::Archived),
            other => Err(format!("unknown conversation status `{other}`")),
        }
    }
}

/// A single chat conversation between the operator and one agent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Conversation {
    pub id: ConversationId,
    pub subject: ConversationSubject,
    /// Catalog agent identifier (`planner`, `coder`, …). Opaque to this
    /// module; the catalog owns its semantics.
    pub agent_id: String,
    pub provider: AgentProvider,
    pub status: ConversationStatus,
    /// Opaque provider session/thread id; written at first `SessionMeta`,
    /// reused on the next turn via `ProtocolAdapter::resume_turn`.
    pub provider_session_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_turn_at: Option<DateTime<Utc>>,
}

/// Lifecycle status of a single turn. `Pending` means the runner has the row
/// but hasn't started streaming yet; `Streaming` means at least one event has
/// flowed; the terminal states mirror `ProtocolEvent` terminals.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnStatus {
    Pending,
    Streaming,
    Completed,
    Failed,
    Cancelled,
}

impl TurnStatus {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }
}

impl std::fmt::Display for TurnStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Pending => "pending",
            Self::Streaming => "streaming",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
        };
        f.write_str(s)
    }
}

impl std::str::FromStr for TurnStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "pending" => Ok(Self::Pending),
            "streaming" => Ok(Self::Streaming),
            "completed" => Ok(Self::Completed),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            other => Err(format!("unknown turn status `{other}`")),
        }
    }
}

/// One operator turn. Holds the user prompt + lifecycle status; the streamed
/// events live in `TurnEvent` rows keyed by `turn_id`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Turn {
    pub id: TurnId,
    pub conversation_id: ConversationId,
    /// Position in the conversation, 0-based. Strictly increasing per
    /// conversation — the runner allocates the next value.
    pub seq: u64,
    pub user_text: String,
    pub status: TurnStatus,
    /// Final usage snapshot, when the adapter emits one on terminate.
    pub usage: Option<UsageSnapshot>,
    /// Filled when status == Failed.
    pub error: Option<TurnFailure>,
    /// Filled when status == Cancelled.
    pub cancel_reason: Option<String>,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
}

/// Provider-stable failure descriptor for a turn. Matches `ProtocolEvent::Failure`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TurnFailure {
    pub code: String,
    pub message: String,
}

/// Persisted protocol event for a turn. The wrapped envelope is exactly what
/// the adapter emitted — no projection — so SSE replay can hand the same JSON
/// to the frontend that a live subscriber would see.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TurnEvent {
    pub id: TurnEventId,
    pub turn_id: TurnId,
    pub envelope: ProtocolEventEnvelope,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subject_round_trips_via_serde() {
        let issue = ConversationSubject::Issue {
            identifier: "SUP-42".into(),
        };
        let json = serde_json::to_string(&issue).expect("serialize");
        let back: ConversationSubject = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(issue, back);

        let run_id = RunId::new();
        let run = ConversationSubject::Run { run_id };
        let json = serde_json::to_string(&run).expect("serialize");
        let back: ConversationSubject = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(run, back);
    }

    #[test]
    fn turn_status_is_terminal_classifies_correctly() {
        assert!(!TurnStatus::Pending.is_terminal());
        assert!(!TurnStatus::Streaming.is_terminal());
        assert!(TurnStatus::Completed.is_terminal());
        assert!(TurnStatus::Failed.is_terminal());
        assert!(TurnStatus::Cancelled.is_terminal());
    }

    #[test]
    fn turn_status_string_round_trip() {
        for status in [
            TurnStatus::Pending,
            TurnStatus::Streaming,
            TurnStatus::Completed,
            TurnStatus::Failed,
            TurnStatus::Cancelled,
        ] {
            let s = status.to_string();
            let back: TurnStatus = s.parse().expect("parse round-trip");
            assert_eq!(status, back);
        }
    }
}
