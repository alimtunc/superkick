//! Workspace-scope run event envelope (SUP-84).
//!
//! A single tagged union covering every event kind the workspace-level event
//! substrate publishes. Frontend shell brokers consume this one stream instead
//! of opening a subscription per run, so the type must be the canonical wire
//! shape — not an internal representation.
//!
//! The enum is deliberately open-ended. Today it carries run events (SUP-69)
//! and session lifecycle events (SUP-79). Future shell-level surfaces can add
//! variants without forcing a second substrate.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::event::RunEvent;
use crate::id::RunId;
use crate::session_lifecycle::SessionLifecycleEvent;

/// Event envelope published on the workspace-level bus.
///
/// Serialized with an explicit `type` discriminant so the frontend broker can
/// fan out by kind without inspecting payload fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkspaceRunEvent {
    /// Persisted run-level event (state changes, step transitions, interrupts,
    /// attention requests, ownership transitions, etc.).
    RunEvent(RunEvent),
    /// Session lifecycle transition from the spawn-and-observe orchestrator.
    SessionLifecycle(SessionLifecycleEvent),
}

impl WorkspaceRunEvent {
    /// Run id this event relates to — always present, so shell brokers can
    /// route to watched-session subscribers without deserialising the payload.
    pub fn run_id(&self) -> RunId {
        match self {
            Self::RunEvent(e) => e.run_id,
            Self::SessionLifecycle(e) => e.run_id,
        }
    }

    /// Event wall-clock timestamp.
    pub fn ts(&self) -> DateTime<Utc> {
        match self {
            Self::RunEvent(e) => e.ts,
            Self::SessionLifecycle(e) => e.ts,
        }
    }

    /// Short stable kind identifier for logs and metrics. Distinct from any
    /// internal event `kind` field — this tags the variant itself.
    pub fn variant(&self) -> &'static str {
        match self {
            Self::RunEvent(_) => "run_event",
            Self::SessionLifecycle(_) => "session_lifecycle",
        }
    }
}

impl From<RunEvent> for WorkspaceRunEvent {
    fn from(event: RunEvent) -> Self {
        Self::RunEvent(event)
    }
}

impl From<SessionLifecycleEvent> for WorkspaceRunEvent {
    fn from(event: SessionLifecycleEvent) -> Self {
        Self::SessionLifecycle(event)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::{EventKind, EventLevel, RunEvent};
    use crate::id::{AgentSessionId, RunId, StepId};
    use crate::session_lifecycle::{SessionLifecycleEvent, SessionLifecyclePhase};

    #[test]
    fn run_event_variant_exposes_run_id() {
        let run_id = RunId::new();
        let event = RunEvent::new(
            run_id,
            None,
            EventKind::StateChange,
            EventLevel::Info,
            "queued → running".into(),
        );
        let envelope: WorkspaceRunEvent = event.into();
        assert_eq!(envelope.run_id(), run_id);
        assert_eq!(envelope.variant(), "run_event");
    }

    #[test]
    fn session_lifecycle_variant_exposes_run_id() {
        let run_id = RunId::new();
        let event = SessionLifecycleEvent::new(
            AgentSessionId::new(),
            run_id,
            StepId::new(),
            None,
            None,
            None,
            None,
            SessionLifecyclePhase::Running,
        );
        let envelope: WorkspaceRunEvent = event.into();
        assert_eq!(envelope.run_id(), run_id);
        assert_eq!(envelope.variant(), "session_lifecycle");
    }

    #[test]
    fn serialises_with_type_discriminant() {
        let run_id = RunId::new();
        let event = RunEvent::new(
            run_id,
            None,
            EventKind::StepStarted,
            EventLevel::Info,
            "prepare".into(),
        );
        let envelope: WorkspaceRunEvent = event.into();
        let json = serde_json::to_value(&envelope).unwrap();
        assert_eq!(json["type"], "run_event");
        assert_eq!(json["run_id"], serde_json::json!(run_id));
    }
}
