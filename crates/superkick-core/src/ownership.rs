//! Session ownership model — SUP-48.
//!
//! Superkick tracks two orthogonal "ownership" concepts per live agent session:
//!
//! 1. **Orchestration ownership** — *who is responsible for driving this session
//!    forward right now*. It's the decision-making owner: the orchestrator
//!    (automated step engine), a named human operator who took over, or a
//!    `Suspended` state while the session is pending a structured handoff or
//!    attention request. The automated progression pauses whenever orchestration
//!    ownership is not `Orchestrator`.
//!
//! 2. **PTY writer ownership** — *who currently holds exclusive keystroke input
//!    on the terminal*. This is the single-writer lease introduced in SUP-75 and
//!    lives in `superkick-runtime::PtySession`. A live session has at most one
//!    writer at a time; `None` means the PTY is read-only for humans.
//!
//! The two are kept orthogonal on purpose: attaching a browser or external
//! terminal to watch (or even type) does not silently transfer decision-making
//! control. An operator taking over is an explicit, audited action that pauses
//! the orchestrator; conversely, resumed automation is an equally explicit
//! release. This prevents hidden control transfers.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::id::{AgentSessionId, AttentionRequestId, HandoffId, RunId};

/// Stable identifier for an operator who can take over a session.
///
/// Superkick is local-first and single-user today, so this is a free-form
/// string (typically an email or short handle). Kept as its own newtype so we
/// can tighten it later without churn.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct OperatorId(pub String);

impl std::fmt::Display for OperatorId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// Why a session's orchestration ownership is currently suspended.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SuspendReason {
    /// Session is blocked waiting for a structured handoff result (SUP-46).
    PendingHandoff { handoff_id: HandoffId },
    /// Session raised an attention request and is waiting for an operator reply.
    AttentionRequested { attention_id: AttentionRequestId },
    /// Session was paused for an unclassified reason. Kept for forward
    /// compatibility — new reasons should get their own variant.
    Other { note: String },
}

/// Orchestration ownership — the decision-making owner of a live session.
///
/// Distinct from the PTY writer lease. The orchestrator is the default; human
/// takeover, suspension, and resumed automation all go through this enum so
/// every transition is visible in one place.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OrchestrationOwner {
    /// The automated step engine is driving the session.
    Orchestrator,
    /// A human operator has explicitly taken over; automated progression is
    /// paused until release.
    Operator {
        operator_id: OperatorId,
        /// Optional short note the operator left ("debugging flaky test", etc.)
        /// so colleagues inspecting the run can see *why* without reading the
        /// PTY transcript.
        note: Option<String>,
    },
    /// Automated progression is paused, but no human has taken over either.
    /// The session is waiting on a structured handoff or attention reply.
    Suspended { reason: SuspendReason },
}

impl OrchestrationOwner {
    /// Shorthand discriminator for logs, events, and storage.
    pub fn kind_str(&self) -> &'static str {
        match self {
            Self::Orchestrator => "orchestrator",
            Self::Operator { .. } => "operator",
            Self::Suspended { .. } => "suspended",
        }
    }

    /// Whether automated progression is currently allowed to act on this session.
    pub fn orchestrator_may_act(&self) -> bool {
        matches!(self, Self::Orchestrator)
    }
}

/// Snapshot of ownership state for a live session, suitable for the API/UI.
///
/// Always includes the orchestration owner; writer-lease info is surfaced
/// alongside so consumers don't need two calls to render the state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionOwnership {
    pub session_id: AgentSessionId,
    pub run_id: RunId,
    pub orchestration: OrchestrationOwner,
    /// Owner was last changed at this timestamp. Recorded so the UI can show
    /// "paused for 4 minutes" without replaying the full event stream.
    pub since: DateTime<Utc>,
    /// Writer lease descriptor if a human currently holds the PTY. `None`
    /// means no human writer — the PTY is read-only for external attaches.
    pub writer: Option<WriterLeaseInfo>,
}

/// Who currently holds the PTY single-writer lease. Mirrors
/// `superkick-runtime::WriterHolder` but lives in core so the API layer can
/// describe the lease without reaching into runtime internals.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WriterLeaseInfo {
    /// Held by a browser attach — typically a connected dashboard tab.
    Browser { holder_id: String },
    /// Held by an external attach — e.g. `superkick attach` in another shell.
    External { holder_id: String },
}

/// The reason an ownership transition happened. Recorded on every transition
/// so later ledger and attention surfaces can attribute the change without
/// inferring it from context.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OwnershipTransitionReason {
    /// Operator explicitly requested takeover.
    OperatorTakeover,
    /// Operator explicitly released — returned control to the orchestrator.
    OperatorRelease,
    /// Orchestrator suspended itself waiting for a handoff to be fulfilled.
    HandoffPending,
    /// Suspended handoff was resolved; orchestrator may act again.
    HandoffResolved,
    /// Orchestrator suspended itself waiting for operator attention.
    AttentionRaised,
    /// Attention request was replied to; orchestrator may act again.
    AttentionResolved,
    /// Session is terminating; ownership is being closed out.
    SessionEnded,
}

/// An audited ownership change. One row is written per transition; the current
/// `OrchestrationOwner` for a session is always reconstructible as "latest
/// event for session_id".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OwnershipEvent {
    pub id: crate::id::OwnershipEventId,
    pub run_id: RunId,
    pub session_id: AgentSessionId,
    /// What the owner was before this event. `None` for the very first event
    /// in a session (i.e. the implicit initial `Orchestrator` state).
    pub from: Option<OrchestrationOwner>,
    pub to: OrchestrationOwner,
    pub reason: OwnershipTransitionReason,
    /// Operator who triggered the transition, if any. Set for operator-driven
    /// transitions (takeover/release); `None` for system-driven transitions
    /// (handoff resolved, session ended, …).
    pub operator_id: Option<OperatorId>,
    pub created_at: DateTime<Utc>,
}

impl OwnershipEvent {
    pub fn new(
        run_id: RunId,
        session_id: AgentSessionId,
        from: Option<OrchestrationOwner>,
        to: OrchestrationOwner,
        reason: OwnershipTransitionReason,
        operator_id: Option<OperatorId>,
    ) -> Self {
        Self {
            id: crate::id::OwnershipEventId::new(),
            run_id,
            session_id,
            from,
            to,
            reason,
            operator_id,
            created_at: Utc::now(),
        }
    }
}

/// Errors produced by the ownership state machine — all transitions go through
/// these guards so the service layer never silently swallows a bad request.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum OwnershipError {
    #[error("session is already owned by operator {0}")]
    AlreadyTakenOver(OperatorId),
    #[error("session is not owned by operator {requested}; current owner is {current}")]
    NotOwner {
        requested: OperatorId,
        current: OperatorId,
    },
    #[error("orchestrator does not currently own this session (state: {state})")]
    NotOrchestratorOwned { state: &'static str },
    #[error("session is suspended and cannot accept this transition (state: {state})")]
    Suspended { state: &'static str },
}

/// Apply a takeover transition to a current owner, returning the next state.
/// Guards against re-taking a session that another operator already owns;
/// taking over from `Orchestrator` or `Suspended` is always allowed because
/// a human stepping in is a legitimate override.
pub fn transition_takeover(
    current: &OrchestrationOwner,
    operator: OperatorId,
    note: Option<String>,
) -> Result<OrchestrationOwner, OwnershipError> {
    match current {
        OrchestrationOwner::Operator {
            operator_id: existing,
            ..
        } if existing != &operator => Err(OwnershipError::AlreadyTakenOver(existing.clone())),
        _ => Ok(OrchestrationOwner::Operator {
            operator_id: operator,
            note,
        }),
    }
}

/// Apply a release transition, returning the orchestrator state if the caller
/// is the current owner.
pub fn transition_release(
    current: &OrchestrationOwner,
    operator: &OperatorId,
) -> Result<OrchestrationOwner, OwnershipError> {
    match current {
        OrchestrationOwner::Operator {
            operator_id: existing,
            ..
        } if existing == operator => Ok(OrchestrationOwner::Orchestrator),
        OrchestrationOwner::Operator {
            operator_id: existing,
            ..
        } => Err(OwnershipError::NotOwner {
            requested: operator.clone(),
            current: existing.clone(),
        }),
        other => Err(OwnershipError::NotOrchestratorOwned {
            state: other.kind_str(),
        }),
    }
}

/// Apply a suspension transition. Callable from either orchestrator or
/// operator state — both can pause for a handoff/attention. Re-suspending an
/// already-suspended session is rejected so the original `SuspendReason`
/// (and the event that produced it) is not silently overwritten.
pub fn transition_suspend(
    current: &OrchestrationOwner,
    reason: SuspendReason,
) -> Result<OrchestrationOwner, OwnershipError> {
    match current {
        OrchestrationOwner::Suspended { .. } => Err(OwnershipError::Suspended {
            state: current.kind_str(),
        }),
        _ => Ok(OrchestrationOwner::Suspended { reason }),
    }
}

/// Resume automation from a suspended state — moves back to `Orchestrator`.
pub fn transition_resume(
    current: &OrchestrationOwner,
) -> Result<OrchestrationOwner, OwnershipError> {
    match current {
        OrchestrationOwner::Suspended { .. } => Ok(OrchestrationOwner::Orchestrator),
        other => Err(OwnershipError::Suspended {
            state: other.kind_str(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn op(name: &str) -> OperatorId {
        OperatorId(name.to_string())
    }

    #[test]
    fn takeover_from_orchestrator_succeeds() {
        let next =
            transition_takeover(&OrchestrationOwner::Orchestrator, op("alice"), None).unwrap();
        assert_eq!(next.kind_str(), "operator");
    }

    #[test]
    fn second_operator_cannot_steal_from_first() {
        let held = OrchestrationOwner::Operator {
            operator_id: op("alice"),
            note: None,
        };
        let err = transition_takeover(&held, op("bob"), None).unwrap_err();
        assert_eq!(err, OwnershipError::AlreadyTakenOver(op("alice")));
    }

    #[test]
    fn same_operator_retaking_is_idempotent() {
        let held = OrchestrationOwner::Operator {
            operator_id: op("alice"),
            note: None,
        };
        let next = transition_takeover(&held, op("alice"), Some("retrying".into())).unwrap();
        match next {
            OrchestrationOwner::Operator { note, .. } => {
                assert_eq!(note.as_deref(), Some("retrying"))
            }
            _ => panic!("expected operator"),
        }
    }

    #[test]
    fn release_by_non_owner_fails() {
        let held = OrchestrationOwner::Operator {
            operator_id: op("alice"),
            note: None,
        };
        let err = transition_release(&held, &op("bob")).unwrap_err();
        assert!(matches!(err, OwnershipError::NotOwner { .. }));
    }

    #[test]
    fn release_by_owner_returns_to_orchestrator() {
        let held = OrchestrationOwner::Operator {
            operator_id: op("alice"),
            note: None,
        };
        let next = transition_release(&held, &op("alice")).unwrap();
        assert!(matches!(next, OrchestrationOwner::Orchestrator));
    }

    #[test]
    fn suspend_from_already_suspended_fails() {
        let held = OrchestrationOwner::Suspended {
            reason: SuspendReason::Other {
                note: "first".into(),
            },
        };
        let err = transition_suspend(
            &held,
            SuspendReason::Other {
                note: "second".into(),
            },
        )
        .unwrap_err();
        assert!(matches!(err, OwnershipError::Suspended { .. }));
    }

    #[test]
    fn resume_from_suspended_returns_to_orchestrator() {
        let held = OrchestrationOwner::Suspended {
            reason: SuspendReason::Other { note: "x".into() },
        };
        let next = transition_resume(&held).unwrap();
        assert!(matches!(next, OrchestrationOwner::Orchestrator));
    }

    #[test]
    fn resume_from_orchestrator_fails() {
        let err = transition_resume(&OrchestrationOwner::Orchestrator).unwrap_err();
        assert!(matches!(err, OwnershipError::Suspended { .. }));
    }

    #[test]
    fn orchestrator_may_act_only_when_orchestrator() {
        assert!(OrchestrationOwner::Orchestrator.orchestrator_may_act());
        assert!(
            !OrchestrationOwner::Operator {
                operator_id: op("a"),
                note: None,
            }
            .orchestrator_may_act()
        );
        assert!(
            !OrchestrationOwner::Suspended {
                reason: SuspendReason::Other { note: "x".into() },
            }
            .orchestrator_may_act()
        );
    }
}
