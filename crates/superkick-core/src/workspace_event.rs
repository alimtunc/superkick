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
use crate::issue_event::IssueEvent;
use crate::recovery::StalledReason;
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
    /// Issue-level transition that does not belong to any single run — e.g.
    /// a Linear blocker resolving (SUP-81). `run_id()` returns `None` for
    /// these; subscribers filtering by run should ignore them.
    IssueEvent(IssueEvent),
    /// Recovery scheduler observed a `Healthy → Stalled` transition for a run
    /// (SUP-73). Annotation only — the run state itself is **never** changed
    /// by the scheduler.
    RunStalled(RunStalledPayload),
    /// Recovery scheduler observed a `Stalled → Healthy` transition (the
    /// dual of `RunStalled`). Lets subscribers clear their badge without
    /// re-fetching the queue.
    RunRecovered(RunRecoveredPayload),
}

/// Payload for [`WorkspaceRunEvent::RunStalled`]. The `reason` is the same
/// structured value the scheduler persists in `run_recovery_events`, so
/// subscribers can render it without re-deriving copy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunStalledPayload {
    pub run_id: RunId,
    pub since: DateTime<Utc>,
    pub reason: StalledReason,
    pub detected_at: DateTime<Utc>,
}

/// Payload for [`WorkspaceRunEvent::RunRecovered`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunRecoveredPayload {
    pub run_id: RunId,
    pub detected_at: DateTime<Utc>,
}

impl WorkspaceRunEvent {
    /// Run id this event relates to. `None` for issue-scope events that
    /// outlive any specific run (currently: blocker resolution).
    pub fn run_id(&self) -> Option<RunId> {
        match self {
            Self::RunEvent(e) => Some(e.run_id),
            Self::SessionLifecycle(e) => Some(e.run_id),
            Self::IssueEvent(_) => None,
            Self::RunStalled(p) => Some(p.run_id),
            Self::RunRecovered(p) => Some(p.run_id),
        }
    }

    /// Event wall-clock timestamp.
    pub fn ts(&self) -> DateTime<Utc> {
        match self {
            Self::RunEvent(e) => e.ts,
            Self::SessionLifecycle(e) => e.ts,
            Self::IssueEvent(e) => e.ts(),
            Self::RunStalled(p) => p.detected_at,
            Self::RunRecovered(p) => p.detected_at,
        }
    }

    /// Short stable kind identifier for logs and metrics. Distinct from any
    /// internal event `kind` field — this tags the variant itself.
    pub fn variant(&self) -> &'static str {
        match self {
            Self::RunEvent(_) => "run_event",
            Self::SessionLifecycle(_) => "session_lifecycle",
            Self::IssueEvent(_) => "issue_event",
            Self::RunStalled(_) => "run_stalled",
            Self::RunRecovered(_) => "run_recovered",
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

impl From<IssueEvent> for WorkspaceRunEvent {
    fn from(event: IssueEvent) -> Self {
        Self::IssueEvent(event)
    }
}

impl From<RunStalledPayload> for WorkspaceRunEvent {
    fn from(payload: RunStalledPayload) -> Self {
        Self::RunStalled(payload)
    }
}

impl From<RunRecoveredPayload> for WorkspaceRunEvent {
    fn from(payload: RunRecoveredPayload) -> Self {
        Self::RunRecovered(payload)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::{EventKind, EventLevel, RunEvent};
    use crate::id::{AgentSessionId, RunId, StepId};
    use crate::issue_event::{DependencyResolvedPayload, IssueEvent};
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
        assert_eq!(envelope.run_id(), Some(run_id));
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
        assert_eq!(envelope.run_id(), Some(run_id));
        assert_eq!(envelope.variant(), "session_lifecycle");
    }

    #[test]
    fn issue_event_variant_has_no_run_id() {
        let event = IssueEvent::DependencyResolved(DependencyResolvedPayload {
            blocker_issue_id: "blocker-uuid".into(),
            blocker_identifier: "SUP-77".into(),
            downstream_issue_id: "downstream-uuid".into(),
            downstream_identifier: "SUP-81".into(),
            resolved_at: Utc::now(),
        });
        let envelope: WorkspaceRunEvent = event.into();
        assert_eq!(envelope.run_id(), None);
        assert_eq!(envelope.variant(), "issue_event");
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

    #[test]
    fn issue_event_serialises_with_kind_discriminant() {
        let event = IssueEvent::DependencyResolved(DependencyResolvedPayload {
            blocker_issue_id: "blocker-uuid".into(),
            blocker_identifier: "SUP-77".into(),
            downstream_issue_id: "downstream-uuid".into(),
            downstream_identifier: "SUP-81".into(),
            resolved_at: Utc::now(),
        });
        let envelope: WorkspaceRunEvent = event.into();
        let json = serde_json::to_value(&envelope).unwrap();
        assert_eq!(json["type"], "issue_event");
        assert_eq!(json["kind"], "dependency_resolved");
        assert_eq!(json["blocker_identifier"], "SUP-77");
    }
}
