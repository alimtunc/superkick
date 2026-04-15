//! Observable session lifecycle events (SUP-79).
//!
//! Handoffs carry *work* between sessions. This module carries *signal* about a
//! session's own lifecycle so the orchestrator can react to observed state
//! changes — spawn-and-observe — instead of only blocking on process exit.
//!
//! Each event is a timestamped snapshot attached to one `AgentSessionId`. The
//! phase encodes where the session is in its lifecycle; lineage fields
//! (`role`, `parent_session_id`, `launch_reason`, `handoff_id`) are
//! denormalised onto every event so downstream consumers can filter without
//! joining back to `agent_sessions`.
//!
//! Emission is the responsibility of the runtime supervisor. Observation is
//! the responsibility of the orchestrator and any auxiliary sinks (persistence,
//! UI fan-out, metrics).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::agent::LaunchReason;
use crate::id::{AgentSessionId, HandoffId, RunId, SessionLifecycleEventId, StepId};

/// Coarse phase of a session's lifecycle. Derived from the supervisor's view
/// of the subprocess and the PTY session wrapping it.
///
/// The set is intentionally small: we want the orchestrator to make decisions
/// on this, not to re-implement a subprocess state machine. Richer information
/// (exit code, failure reason) is attached as structured fields.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "phase", rename_all = "snake_case")]
pub enum SessionLifecyclePhase {
    /// Supervisor has allocated a `SessionId` and inserted the row but has not
    /// yet spawned the child process.
    Spawning,
    /// Child process is running; PTY is attachable.
    Running,
    /// Child exited successfully.
    Completed { exit_code: i32 },
    /// Child exited with non-zero status or produced an operational failure.
    Failed {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        exit_code: Option<i32>,
        reason: String,
    },
    /// Child was cancelled by the orchestrator or an operator.
    Cancelled,
    /// Child was killed because it exceeded its launch timeout.
    TimedOut,
}

impl SessionLifecyclePhase {
    /// Once a session reaches a terminal phase, the orchestrator can stop
    /// observing it and release any per-session resources.
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Completed { .. } | Self::Failed { .. } | Self::Cancelled | Self::TimedOut
        )
    }

    /// Short stable string for display and storage classification (separate
    /// from the full serialized payload).
    pub fn tag(&self) -> &'static str {
        match self {
            Self::Spawning => "spawning",
            Self::Running => "running",
            Self::Completed { .. } => "completed",
            Self::Failed { .. } => "failed",
            Self::Cancelled => "cancelled",
            Self::TimedOut => "timed_out",
        }
    }
}

/// One observation of a session's state.
///
/// Events are append-only and uniquely identified so persistence can dedupe
/// and readers can resume an observation stream from an offset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionLifecycleEvent {
    pub id: SessionLifecycleEventId,
    pub session_id: AgentSessionId,
    pub run_id: RunId,
    /// Originating run step — copied off the session so observers can correlate
    /// events with the run state machine without a join.
    pub step_id: StepId,
    /// Catalog role snapshot.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    /// Parent session, when this is a child.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_session_id: Option<AgentSessionId>,
    /// Launch reason snapshot.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launch_reason: Option<LaunchReason>,
    /// Handoff this session is fulfilling, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub handoff_id: Option<HandoffId>,
    pub phase: SessionLifecyclePhase,
    pub ts: DateTime<Utc>,
}

impl SessionLifecycleEvent {
    /// Construct an event with a fresh id and `Utc::now()`.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        session_id: AgentSessionId,
        run_id: RunId,
        step_id: StepId,
        role: Option<String>,
        parent_session_id: Option<AgentSessionId>,
        launch_reason: Option<LaunchReason>,
        handoff_id: Option<HandoffId>,
        phase: SessionLifecyclePhase,
    ) -> Self {
        Self {
            id: SessionLifecycleEventId::new(),
            session_id,
            run_id,
            step_id,
            role,
            parent_session_id,
            launch_reason,
            handoff_id,
            phase,
            ts: Utc::now(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_classification() {
        assert!(!SessionLifecyclePhase::Spawning.is_terminal());
        assert!(!SessionLifecyclePhase::Running.is_terminal());
        assert!(SessionLifecyclePhase::Completed { exit_code: 0 }.is_terminal());
        assert!(
            SessionLifecyclePhase::Failed {
                exit_code: Some(1),
                reason: "boom".into()
            }
            .is_terminal()
        );
        assert!(SessionLifecyclePhase::Cancelled.is_terminal());
        assert!(SessionLifecyclePhase::TimedOut.is_terminal());
    }

    #[test]
    fn tag_is_stable() {
        assert_eq!(SessionLifecyclePhase::Spawning.tag(), "spawning");
        assert_eq!(SessionLifecyclePhase::Running.tag(), "running");
        assert_eq!(
            SessionLifecyclePhase::Completed { exit_code: 0 }.tag(),
            "completed"
        );
        assert_eq!(
            SessionLifecyclePhase::Failed {
                exit_code: None,
                reason: String::new()
            }
            .tag(),
            "failed"
        );
        assert_eq!(SessionLifecyclePhase::Cancelled.tag(), "cancelled");
        assert_eq!(SessionLifecyclePhase::TimedOut.tag(), "timed_out");
    }

    #[test]
    fn event_carries_lineage() {
        let run = RunId::new();
        let step = StepId::new();
        let sess = AgentSessionId::new();
        let parent = AgentSessionId::new();
        let hand = HandoffId::new();
        let e = SessionLifecycleEvent::new(
            sess,
            run,
            step,
            Some("planner".into()),
            Some(parent),
            Some(LaunchReason::Handoff),
            Some(hand),
            SessionLifecyclePhase::Running,
        );
        assert_eq!(e.session_id, sess);
        assert_eq!(e.run_id, run);
        assert_eq!(e.step_id, step);
        assert_eq!(e.parent_session_id, Some(parent));
        assert_eq!(e.handoff_id, Some(hand));
        assert_eq!(e.launch_reason, Some(LaunchReason::Handoff));
        assert!(matches!(e.phase, SessionLifecyclePhase::Running));
    }
}
