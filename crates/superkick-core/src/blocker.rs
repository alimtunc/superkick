//! Issue-level blocker persistence model (SUP-81).
//!
//! Linear exposes "blocks" relations between issues. Superkick persists the
//! *incoming* side (who blocks me) so the launch-queue classifier can gate
//! downstream issues without a second Linear round-trip on every pulse.
//!
//! One row per `(downstream_issue_id, blocker_issue_id)` pair; re-polling
//! Linear replaces the snapshot wholesale. Any blocker that disappeared from
//! the live snapshot *or* transitioned to a terminal Linear state counts as
//! "resolved" for the purposes of the unblock flow.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Linear state types that count as "terminal" for Superkick's purposes —
/// both blocker resolution (here) and the `launch_queue` classifier reuse
/// this set so there is exactly one definition of "done Linear work".
pub const TERMINAL_BLOCKER_STATES: [&str; 2] = ["completed", "canceled"];

/// Returns whether a Linear `state.type` string counts as terminal for
/// blocker accounting.
#[must_use]
pub fn is_terminal_blocker_state(state_type: &str) -> bool {
    TERMINAL_BLOCKER_STATES.contains(&state_type)
}

/// Persisted row of `issue_blockers`. Denormalises the blocker's identifier,
/// title and state so the launch queue can render "Blocked by SUP-77" without
/// re-hydrating the blocker issue from Linear.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IssueBlocker {
    /// Linear UUID of the downstream (blocked) issue.
    pub downstream_issue_id: String,
    /// Linear UUID of the blocker (upstream) issue.
    pub blocker_issue_id: String,
    /// Short identifier of the blocker (e.g. `SUP-77`), shown to the operator.
    pub blocker_identifier: String,
    /// Title of the blocker issue, shown inline on the downstream card.
    pub blocker_title: String,
    /// Linear `state.type` of the blocker at the time the row was written.
    /// `"unknown"` when the blocker is outside the fetched workspace slice.
    pub blocker_state_type: String,
    /// Wall-clock time the row was last refreshed.
    pub recorded_at: DateTime<Utc>,
}
