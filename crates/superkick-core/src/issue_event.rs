//! Issue-scoped event types carried on the workspace bus (SUP-81).
//!
//! Some transitions matter to the operator without belonging to a run —
//! notably, a Linear blocker relation resolving. Those events flow on the
//! same `WorkspaceEventBus` as `RunEvent` / `SessionLifecycleEvent`, but they
//! don't carry a `RunId` (they live one level above: the Linear issue itself,
//! not the Superkick run supervising it).
//!
//! Kept minimal on purpose: the bus is the broadcast substrate, the
//! `issue_blockers` table is the audit trail. The event exists so the UI can
//! show an "unblocked just now" affordance within the current session.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Issue-scope event envelope. Tagged by `kind` so a future variant (e.g.
/// `BlockerAdded`) can join without reshaping the type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum IssueEvent {
    /// A Linear blocker that was gating a downstream issue has transitioned
    /// to a terminal state (`completed` / `canceled`), or disappeared from
    /// the live relation set.
    DependencyResolved(DependencyResolvedPayload),
}

impl IssueEvent {
    /// Wall-clock timestamp of the transition.
    pub fn ts(&self) -> DateTime<Utc> {
        match self {
            Self::DependencyResolved(p) => p.resolved_at,
        }
    }

    /// Downstream issue this event pertains to.
    pub fn downstream_issue_id(&self) -> &str {
        match self {
            Self::DependencyResolved(p) => &p.downstream_issue_id,
        }
    }
}

/// Payload for `dependency_resolved`. Identifiers included alongside UUIDs
/// so SSE consumers can render "SUP-77 resolved" without a second lookup.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DependencyResolvedPayload {
    pub blocker_issue_id: String,
    pub blocker_identifier: String,
    pub downstream_issue_id: String,
    pub downstream_identifier: String,
    pub resolved_at: DateTime<Utc>,
}
