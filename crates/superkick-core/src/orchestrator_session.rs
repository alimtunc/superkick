//! Long-running orchestrator session model — SUP-102.
//!
//! An `OrchestratorSession` is the durable thread of a meta-conversation that
//! drives one or more child runs. Distinct from `Run` (which is a single-issue
//! pipeline): a session can outlive any individual run, span multiple Linear
//! issues, and accumulate compacted `OrchestratorCheckpoint`s so a future turn
//! can be primed with a summary instead of the raw transcript.
//!
//! This ticket is the data foundation only — there is no autonomous loop yet
//! (SUP-95 child 8) and no policy/MCP wiring (SUP-95 child 9). The session is
//! created and mutated entirely through explicit API calls.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::agent::AgentProvider;
use crate::error::CoreError;
use crate::id::{
    EventId, HandoffId, OrchestratorCheckpointId, OrchestratorSessionId, RunId, RuntimeProviderId,
};
use crate::ownership::OperatorId;

/// Lifecycle state of an orchestrator session.
///
/// Intentionally separate from `RunState` even though some variants look
/// similar: a session covers a meta-conversation across many runs, and its
/// transitions describe the orchestrator's activity (thinking, dispatching
/// children, blocked waiting), not a one-issue pipeline. Sharing the enum
/// would let invalid run-shaped transitions slip through the type system.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrchestratorStatus {
    /// No active turn — waiting for a fresh prompt or a wake-up.
    Idle,
    /// Running a turn against the underlying provider.
    Thinking,
    /// Spawning or supervising child runs / handoffs.
    Dispatching,
    /// Awaiting an explicit operator response (decision, confirmation).
    WaitingHuman,
    /// External dependency unmet — session may transition out once resolved.
    Blocked,
    /// Operator paused the session; no automation until resumed.
    Paused,
    /// Terminal: session ran into an unrecoverable error.
    Failed,
    /// Terminal: session reached its natural end.
    Completed,
}

impl OrchestratorStatus {
    /// Returns `true` for states from which the session never moves again.
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Completed | Self::Failed)
    }

    /// Set of states this state may transition to.
    ///
    /// Design rationale (asymmetries that look surprising at first glance):
    ///
    /// - **`Completed` is only reachable from quiescent states**
    ///   (`Idle`, `WaitingHuman`, `Paused`). Active states (`Thinking`,
    ///   `Dispatching`, `Blocked`) must first quiesce — closing out an
    ///   in-flight turn from the middle of provider work would race against
    ///   the provider's own emit loop.
    /// - **`Paused` cannot resume directly into `Thinking` / `Dispatching`** —
    ///   the operator-resume path always lands in `Idle`, then the next
    ///   trigger (prompt, wake-up) decides the active state. This keeps the
    ///   resume contract explicit instead of implicit.
    /// - **`Blocked` cannot reach `Dispatching`** — it must first surface in
    ///   `Idle` or `WaitingHuman` so the operator sees the unblock event
    ///   before children spawn against potentially stale context.
    /// - **`Failed` is reachable from every non-terminal state** — failure
    ///   can happen anywhere, so we never gate it.
    pub fn allowed_transitions(self) -> &'static [OrchestratorStatus] {
        use OrchestratorStatus::*;
        match self {
            Idle => &[
                Thinking,
                Dispatching,
                WaitingHuman,
                Paused,
                Failed,
                Completed,
            ],
            Thinking => &[Idle, Dispatching, WaitingHuman, Blocked, Failed],
            Dispatching => &[Thinking, Idle, WaitingHuman, Blocked, Failed],
            WaitingHuman => &[Idle, Thinking, Dispatching, Paused, Failed, Completed],
            Blocked => &[Idle, Thinking, WaitingHuman, Paused, Failed],
            Paused => &[Idle, Failed, Completed],
            Completed | Failed => &[],
        }
    }

    pub fn can_transition_to(self, target: OrchestratorStatus) -> bool {
        self.allowed_transitions().contains(&target)
    }

    /// Attempt to transition. `Err(CoreError::InvalidOrchestratorTransition)`
    /// describes the rejected edge so the API layer can render a 409 with a
    /// stable shape — distinct from `InvalidInput` (400) which covers payload
    /// validation.
    pub fn transition_to(
        self,
        target: OrchestratorStatus,
    ) -> Result<OrchestratorStatus, CoreError> {
        if self.can_transition_to(target) {
            Ok(target)
        } else {
            Err(CoreError::InvalidOrchestratorTransition {
                from: self,
                to: target,
            })
        }
    }
}

impl std::fmt::Display for OrchestratorStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Idle => "idle",
            Self::Thinking => "thinking",
            Self::Dispatching => "dispatching",
            Self::WaitingHuman => "waiting_human",
            Self::Blocked => "blocked",
            Self::Paused => "paused",
            Self::Failed => "failed",
            Self::Completed => "completed",
        };
        f.write_str(s)
    }
}

/// What the orchestrator session is scoped to. Stored as a single JSON column
/// — there is no junction table yet because the lookup volume is tiny and the
/// shape is still evolving (SUP-95 follow-ups).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrchestratorScope {
    /// Linear identifiers (`SUP-XXX`) the session is responsible for.
    #[serde(default)]
    pub linear_issue_ids: Vec<String>,
    /// Optional Linear project identifier the session belongs to.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// Parent feature/epic the session derives from, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_feature_issue: Option<String>,
    /// Free-form labels propagated from the operator's framing.
    #[serde(default)]
    pub labels: Vec<String>,
}

impl OrchestratorScope {
    /// Reject scopes with empty `linear_issue_ids` entries. Centralised so
    /// the create and patch paths share one rule.
    pub fn validate(&self) -> Result<(), CoreError> {
        for issue in &self.linear_issue_ids {
            if issue.trim().is_empty() {
                return Err(CoreError::InvalidInput(
                    "orchestrator session scope.linear_issue_ids must not contain empty entries"
                        .into(),
                ));
            }
        }
        Ok(())
    }
}

/// A long-running orchestrator session. Owns its own provider thread/session
/// id so a future turn can be resumed across process restarts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorSession {
    pub id: OrchestratorSessionId,
    pub title: String,
    pub provider: AgentProvider,
    /// Optional pinned runtime. `None` defers resolution to the runtime
    /// registry at turn time.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runtime_provider_id: Option<RuntimeProviderId>,
    pub status: OrchestratorStatus,
    pub owner: OperatorId,
    pub scope: OrchestratorScope,
    /// Provider-side session/thread identifier used for resume. Written when
    /// the first turn produces it; consumed on subsequent turns.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_session_id: Option<String>,
    /// Latest checkpoint pointer — kept denormalised so a session detail page
    /// can render the freshest summary without joining `orchestrator_checkpoints`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_checkpoint_id: Option<OrchestratorCheckpointId>,
    /// Last event the session acknowledged. Lets a future loop resume from
    /// the right cursor instead of replaying everything.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_event_cursor: Option<EventId>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl OrchestratorSession {
    /// Create a fresh session in `Idle`. Validates `title` and `owner` are
    /// non-empty and delegates scope validation to `OrchestratorScope::validate`.
    pub fn new(
        title: impl Into<String>,
        provider: AgentProvider,
        runtime_provider_id: Option<RuntimeProviderId>,
        owner: OperatorId,
        scope: OrchestratorScope,
    ) -> Result<Self, CoreError> {
        let title = title.into();
        if title.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "orchestrator session title must not be empty".into(),
            ));
        }
        if owner.0.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "orchestrator session owner must not be empty".into(),
            ));
        }
        scope.validate()?;
        let now = Utc::now();
        Ok(Self {
            id: OrchestratorSessionId::new(),
            title,
            provider,
            runtime_provider_id,
            status: OrchestratorStatus::Idle,
            owner,
            scope,
            provider_session_id: None,
            latest_checkpoint_id: None,
            last_event_cursor: None,
            created_at: now,
            updated_at: now,
        })
    }

    /// Apply a status transition, bumping `updated_at`.
    pub fn transition_to(&mut self, target: OrchestratorStatus) -> Result<(), CoreError> {
        self.status = self.status.transition_to(target)?;
        self.touch();
        Ok(())
    }

    /// Replace the scope after validating it. Bumps `updated_at`.
    pub fn set_scope(&mut self, scope: OrchestratorScope) -> Result<(), CoreError> {
        scope.validate()?;
        self.scope = scope;
        self.touch();
        Ok(())
    }

    /// Persist the provider thread/session id for future resume.
    pub fn set_provider_session_id(&mut self, id: String) {
        self.provider_session_id = Some(id);
        self.touch();
    }

    /// Move the cursor that tracks the last acknowledged event.
    pub fn set_last_event_cursor(&mut self, cursor: EventId) {
        self.last_event_cursor = Some(cursor);
        self.touch();
    }

    fn touch(&mut self) {
        self.updated_at = Utc::now();
    }
}

/// Compacted summary of a slice of the session's transcript / event stream,
/// produced manually today and by an automated compactor in a future ticket.
/// The raw transcript and run events are *never* deleted — checkpoints are an
/// additive lens on top.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestratorCheckpoint {
    pub id: OrchestratorCheckpointId,
    pub session_id: OrchestratorSessionId,
    pub summary: String,
    /// Inclusive lower bound of the event slice this checkpoint summarises,
    /// expressed in `EventId`. `None` for the very first checkpoint of a
    /// session (covers from the beginning).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub covers_from_event: Option<EventId>,
    /// Inclusive upper bound of the slice. `None` means "up to the latest
    /// observed event at write time".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub covers_to_event: Option<EventId>,
    #[serde(default)]
    pub decisions: Vec<String>,
    #[serde(default)]
    pub open_questions: Vec<String>,
    #[serde(default)]
    pub child_run_ids: Vec<RunId>,
    #[serde(default)]
    pub child_handoff_ids: Vec<HandoffId>,
    pub created_at: DateTime<Utc>,
}

impl OrchestratorCheckpoint {
    /// Create a checkpoint. Validates `summary` is non-empty.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        session_id: OrchestratorSessionId,
        summary: impl Into<String>,
        covers_from_event: Option<EventId>,
        covers_to_event: Option<EventId>,
        decisions: Vec<String>,
        open_questions: Vec<String>,
        child_run_ids: Vec<RunId>,
        child_handoff_ids: Vec<HandoffId>,
    ) -> Result<Self, CoreError> {
        let summary = summary.into();
        if summary.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "orchestrator checkpoint summary must not be empty".into(),
            ));
        }
        Ok(Self {
            id: OrchestratorCheckpointId::new(),
            session_id,
            summary,
            covers_from_event,
            covers_to_event,
            decisions,
            open_questions,
            child_run_ids,
            child_handoff_ids,
            created_at: Utc::now(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn op() -> OperatorId {
        OperatorId("alice".into())
    }

    fn session() -> OrchestratorSession {
        OrchestratorSession::new(
            "drive SUP-95 epic",
            AgentProvider::Claude,
            None,
            op(),
            OrchestratorScope {
                linear_issue_ids: vec!["SUP-95".into()],
                ..OrchestratorScope::default()
            },
        )
        .expect("session")
    }

    #[test]
    fn new_starts_idle() {
        let s = session();
        assert_eq!(s.status, OrchestratorStatus::Idle);
        assert!(s.provider_session_id.is_none());
        assert!(s.latest_checkpoint_id.is_none());
    }

    #[test]
    fn empty_title_rejected() {
        let err = OrchestratorSession::new(
            "   ",
            AgentProvider::Claude,
            None,
            op(),
            OrchestratorScope::default(),
        )
        .unwrap_err();
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }

    #[test]
    fn empty_owner_rejected() {
        let err = OrchestratorSession::new(
            "session",
            AgentProvider::Claude,
            None,
            OperatorId("   ".into()),
            OrchestratorScope::default(),
        )
        .unwrap_err();
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }

    #[test]
    fn empty_linear_issue_id_rejected() {
        let err = OrchestratorSession::new(
            "session",
            AgentProvider::Claude,
            None,
            op(),
            OrchestratorScope {
                linear_issue_ids: vec!["SUP-1".into(), "  ".into()],
                ..OrchestratorScope::default()
            },
        )
        .unwrap_err();
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }

    #[test]
    fn set_scope_revalidates() {
        let mut s = session();
        let err = s
            .set_scope(OrchestratorScope {
                linear_issue_ids: vec!["".into()],
                ..OrchestratorScope::default()
            })
            .unwrap_err();
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }

    #[test]
    fn terminal_states_have_no_outgoing_edges() {
        for terminal in [OrchestratorStatus::Completed, OrchestratorStatus::Failed] {
            assert!(terminal.is_terminal());
            assert!(terminal.allowed_transitions().is_empty());
        }
    }

    #[test]
    fn idle_can_reach_thinking_dispatching_waiting_paused_failed_completed() {
        let from = OrchestratorStatus::Idle;
        for target in [
            OrchestratorStatus::Thinking,
            OrchestratorStatus::Dispatching,
            OrchestratorStatus::WaitingHuman,
            OrchestratorStatus::Paused,
            OrchestratorStatus::Failed,
            OrchestratorStatus::Completed,
        ] {
            assert!(from.can_transition_to(target), "Idle should reach {target}");
        }
    }

    #[test]
    fn invalid_transition_returns_invalid_orchestrator_transition() {
        // Completed is terminal — anything from Completed is invalid.
        let err = OrchestratorStatus::Completed
            .transition_to(OrchestratorStatus::Idle)
            .unwrap_err();
        assert!(matches!(
            err,
            CoreError::InvalidOrchestratorTransition {
                from: OrchestratorStatus::Completed,
                to: OrchestratorStatus::Idle,
            }
        ));
    }

    #[test]
    fn paused_cannot_jump_back_to_thinking_directly() {
        // Paused must go through Idle (or terminate) — the operator-resume
        // path is explicit, not implicit.
        let err = OrchestratorStatus::Paused
            .transition_to(OrchestratorStatus::Thinking)
            .unwrap_err();
        assert!(matches!(
            err,
            CoreError::InvalidOrchestratorTransition { .. }
        ));
    }

    #[test]
    fn session_transition_updates_updated_at() {
        let mut s = session();
        let before = s.updated_at;
        // Sleep is a code-smell — instead, set updated_at to the past and
        // verify the field moves forward.
        s.updated_at = before - chrono::Duration::seconds(60);
        s.transition_to(OrchestratorStatus::Thinking).unwrap();
        assert_eq!(s.status, OrchestratorStatus::Thinking);
        assert!(s.updated_at > before - chrono::Duration::seconds(60));
    }

    #[test]
    fn checkpoint_rejects_empty_summary() {
        let err = OrchestratorCheckpoint::new(
            OrchestratorSessionId::new(),
            "  ",
            None,
            None,
            vec![],
            vec![],
            vec![],
            vec![],
        )
        .unwrap_err();
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }

    /// Pin `Display` and the `serde(rename_all = "snake_case")` representation
    /// together. If someone renames a variant or tweaks the rename, the test
    /// fails before the wire format silently drifts.
    #[test]
    fn display_matches_serde_for_every_variant() {
        for status in [
            OrchestratorStatus::Idle,
            OrchestratorStatus::Thinking,
            OrchestratorStatus::Dispatching,
            OrchestratorStatus::WaitingHuman,
            OrchestratorStatus::Blocked,
            OrchestratorStatus::Paused,
            OrchestratorStatus::Failed,
            OrchestratorStatus::Completed,
        ] {
            let serde_repr = serde_json::to_string(&status).unwrap();
            // Serde wraps strings in quotes — strip them before comparing.
            let serde_repr = serde_repr.trim_matches('"');
            assert_eq!(serde_repr, format!("{status}"));
        }
    }
}
