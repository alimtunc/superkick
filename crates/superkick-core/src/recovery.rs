//! Heartbeat-driven recovery classifier (SUP-73).
//!
//! This module is intentionally pure: given a `RecoveryCandidate` snapshot of a
//! run plus the current wall-clock time and a `RecoveryConfig`, it returns a
//! `RecoveryStatus` saying whether the run is `Healthy` or `Stalled`. It does
//! **not** mutate run state, persist anything, or emit events — those are the
//! scheduler's job.
//!
//! ## Hard invariant — no autonomous mutation
//!
//! Recovery here is *visibility*, not *autonomy*. The scheduler that consumes
//! this classifier must never transition a run, kill a session, or unpause a
//! `WaitingHuman` run. If a run is `WaitingHuman`, we wait for the human —
//! period. The classifier can return `Stalled` for any non-terminal state,
//! including `WaitingHuman`, so the operator can see "this human ask has been
//! sitting for 30 min". The decision to act stays with the operator.
//!
//! Adding any auto-action policy (auto-fail, auto-retry, auto-cancel) is a
//! different ticket with its own UI surface and explicit policy config — not
//! a quiet extension of this module.
//!
//! ## How staleness is measured
//!
//! For each non-terminal run we compare `now` against the freshest of two
//! signals — `last_heartbeat_at` (set by the runtime listener for every
//! observed `SessionLifecycleEvent`) and `updated_at` (set by every state
//! transition). The age of the most recent signal is compared to a per-state
//! threshold from `RecoveryConfig`. If neither has fired in longer than the
//! threshold, the run is `Stalled`.
//!
//! Thresholds are heuristics — see `RecoveryConfig::default_thresholds` for
//! starting values. They are configurable per deployment so calibration after
//! observation does not require a code change.

use std::collections::HashMap;
use std::time::Duration;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::id::RunId;
use crate::run::RunState;

/// Read-only snapshot of a run, fed into [`classify`]. Built by the storage
/// layer once per scheduler tick; the classifier never sees a `Run` directly
/// to keep the dependency direction (`api → core`, never `core → storage`).
#[derive(Debug, Clone, Copy)]
pub struct RecoveryCandidate {
    pub run_id: RunId,
    pub state: RunState,
    pub updated_at: DateTime<Utc>,
    pub last_heartbeat_at: Option<DateTime<Utc>>,
}

/// Per-state staleness ceiling and tick interval. Cloned cheaply per tick.
///
/// Defaults are heuristics tuned to the long human-ask path (`WaitingHuman` 30
/// min) being the dominant idle signal we want surfaced, and the agent-driven
/// states being shorter so an agent that wedges shows up within a few minutes.
#[derive(Debug, Clone)]
pub struct RecoveryConfig {
    /// How often the scheduler ticks. Not used by `classify` itself but kept
    /// here so the operator-tunable knobs live in one place.
    pub tick_interval: Duration,
    /// Per-state staleness ceiling. A run whose newest signal is older than
    /// `thresholds[state]` is `Stalled`. Missing entries fall back to
    /// [`Self::DEFAULT_THRESHOLD`] so a future `RunState` variant cannot
    /// silently bypass the scheduler.
    pub thresholds: HashMap<RunState, Duration>,
}

impl RecoveryConfig {
    /// Conservative fallback applied when a state has no explicit threshold.
    /// Picked to be longer than every default below so a missing entry leans
    /// toward fewer false positives, not more.
    pub const DEFAULT_THRESHOLD: Duration = Duration::from_secs(30 * 60);

    /// Default tick cadence — 30s gives the dashboard near-real-time staleness
    /// without flooding the audit table. Tuned so an idle Superkick keeps the
    /// scheduler cheap.
    pub const DEFAULT_TICK_INTERVAL: Duration = Duration::from_secs(30);

    /// Build the default per-state threshold map.
    #[must_use]
    pub fn default_thresholds() -> HashMap<RunState, Duration> {
        let mut t = HashMap::new();
        t.insert(RunState::Queued, Duration::from_secs(2 * 60));
        t.insert(RunState::Preparing, Duration::from_secs(5 * 60));
        t.insert(RunState::Planning, Duration::from_secs(10 * 60));
        t.insert(RunState::Coding, Duration::from_secs(5 * 60));
        t.insert(RunState::RunningCommands, Duration::from_secs(10 * 60));
        t.insert(RunState::Reviewing, Duration::from_secs(5 * 60));
        t.insert(RunState::OpeningPr, Duration::from_secs(5 * 60));
        t.insert(RunState::WaitingHuman, Duration::from_secs(30 * 60));
        // Terminal states are excluded by `classify` before threshold lookup.
        t
    }

    /// Resolve the threshold for a state, defaulting to
    /// [`Self::DEFAULT_THRESHOLD`] when not configured.
    #[must_use]
    pub fn threshold_for(&self, state: RunState) -> Duration {
        self.thresholds
            .get(&state)
            .copied()
            .unwrap_or(Self::DEFAULT_THRESHOLD)
    }
}

impl Default for RecoveryConfig {
    fn default() -> Self {
        Self {
            tick_interval: Self::DEFAULT_TICK_INTERVAL,
            thresholds: Self::default_thresholds(),
        }
    }
}

/// Why a run was flagged stalled. Variants encode the operator-facing
/// distinction between "no signal at all yet" (the run sat in `Queued` past
/// its threshold without a single heartbeat) and "signal stopped" (a run
/// previously emitted heartbeats but went quiet).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StalledReason {
    /// A run reached its threshold without ever emitting a session lifecycle
    /// event. Most often a `Queued` run that never got dispatched.
    NeverDispatched { state: RunState, age_secs: u64 },
    /// `WaitingHuman` for longer than the configured ceiling. The operator
    /// owns the next move — we only annotate.
    AwaitingHuman { age_secs: u64 },
    /// A run that previously had life signs but whose newest signal is now
    /// older than the per-state threshold.
    NoHeartbeat { state: RunState, age_secs: u64 },
}

impl StalledReason {
    /// Operator-facing one-liner. Intentionally short — the dashboard badge
    /// renders this verbatim.
    #[must_use]
    pub fn display(&self) -> String {
        match self {
            Self::NeverDispatched { state, age_secs } => {
                format!("never dispatched — {state} for {}", format_age(*age_secs))
            }
            Self::AwaitingHuman { age_secs } => {
                format!("awaiting human reply for {}", format_age(*age_secs))
            }
            Self::NoHeartbeat { state, age_secs } => {
                format!(
                    "no heartbeat — {state} silent for {}",
                    format_age(*age_secs)
                )
            }
        }
    }

    /// Stable kind tag for storage / dedup. `NeverDispatched` and
    /// `NoHeartbeat` both share the `"no_heartbeat"` tag at the audit layer
    /// because the operator action is the same; the verbose distinction lives
    /// in the rendered reason string.
    #[must_use]
    pub const fn audit_tag(&self) -> &'static str {
        match self {
            Self::NeverDispatched { .. } | Self::NoHeartbeat { .. } => "no_heartbeat",
            Self::AwaitingHuman { .. } => "awaiting_human",
        }
    }
}

fn format_age(age_secs: u64) -> String {
    if age_secs < 60 {
        format!("{age_secs}s")
    } else if age_secs < 3600 {
        format!("{}m", age_secs / 60)
    } else {
        format!("{}h{}m", age_secs / 3600, (age_secs % 3600) / 60)
    }
}

/// Result of classifying one run. `Healthy` carries no payload because the
/// scheduler ignores it except for the `Stalled → Healthy` transition.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecoveryStatus {
    Healthy,
    Stalled {
        since: DateTime<Utc>,
        reason: StalledReason,
    },
}

impl RecoveryStatus {
    #[must_use]
    pub fn is_stalled(&self) -> bool {
        matches!(self, Self::Stalled { .. })
    }
}

/// Classify a single run. Pure function — same inputs always produce the same
/// output.
///
/// Returns `Healthy` for terminal runs unconditionally. The scheduler should
/// drop terminal candidates before calling this; the safety check exists so
/// any caller (including tests) cannot accidentally surface a completed run
/// as stalled.
#[must_use]
pub fn classify(
    candidate: &RecoveryCandidate,
    now: DateTime<Utc>,
    cfg: &RecoveryConfig,
) -> RecoveryStatus {
    if candidate.state.is_terminal() {
        return RecoveryStatus::Healthy;
    }

    let threshold = cfg.threshold_for(candidate.state);

    // Choose the freshest signal we have. `last_heartbeat_at` only fires on
    // session lifecycle events, so an idle `WaitingHuman` run with no heartbeat
    // falls through to `updated_at` (the time the run entered the state).
    let newest_signal = match candidate.last_heartbeat_at {
        Some(hb) if hb >= candidate.updated_at => hb,
        _ => candidate.updated_at,
    };

    let age = now.signed_duration_since(newest_signal);
    let age_secs = age.num_seconds().max(0) as u64;
    if age <= chrono::Duration::from_std(threshold).unwrap_or(chrono::Duration::zero()) {
        return RecoveryStatus::Healthy;
    }

    let reason = match (candidate.state, candidate.last_heartbeat_at) {
        (RunState::WaitingHuman, _) => StalledReason::AwaitingHuman { age_secs },
        (state, None) => StalledReason::NeverDispatched { state, age_secs },
        (state, Some(_)) => StalledReason::NoHeartbeat { state, age_secs },
    };

    RecoveryStatus::Stalled {
        since: newest_signal,
        reason,
    }
}

/// What the scheduler should do for one (status, latest-audit-row) pair.
/// Pure dedup logic split out of the api scheduler so it can be unit-tested
/// without a sqlite fixture.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RecoveryAction {
    /// First sighting of a stalled run (or sighting after a `Recovered` row):
    /// emit a `stalled` audit row + bus event with these payload fields.
    EmitStalled {
        since: DateTime<Utc>,
        reason: StalledReason,
    },
    /// Run has gone back to healthy after a previous `Stalled` row: emit a
    /// `recovered` audit row + bus event.
    EmitRecovered,
    /// Stalled-while-already-stalled or healthy-while-already-healthy. The
    /// scheduler emits nothing — this is the dedup guarantee.
    Skip,
}

/// Tag of the most recent `run_recovery_events` row for this run. Mirrors
/// `superkick_storage::RecoveryEventKind` without forcing `superkick-core` to
/// depend on storage. The scheduler maps the storage enum to this one before
/// calling [`decide_action`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LatestEventTag {
    Stalled,
    Recovered,
}

/// Combine a freshly classified [`RecoveryStatus`] with the tag of the most
/// recent audit row for the same run, and decide whether the scheduler
/// should emit a new row.
#[must_use]
pub fn decide_action(status: RecoveryStatus, latest: Option<LatestEventTag>) -> RecoveryAction {
    match (status, latest) {
        (RecoveryStatus::Stalled { since, reason }, None | Some(LatestEventTag::Recovered)) => {
            RecoveryAction::EmitStalled { since, reason }
        }
        (RecoveryStatus::Healthy, Some(LatestEventTag::Stalled)) => RecoveryAction::EmitRecovered,
        _ => RecoveryAction::Skip,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn at(secs: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(1_700_000_000 + secs, 0).single().unwrap()
    }

    fn candidate(
        state: RunState,
        updated_at_secs: i64,
        heartbeat_secs: Option<i64>,
    ) -> RecoveryCandidate {
        RecoveryCandidate {
            run_id: RunId::new(),
            state,
            updated_at: at(updated_at_secs),
            last_heartbeat_at: heartbeat_secs.map(at),
        }
    }

    #[test]
    fn decide_action_emits_stalled_when_no_prior_row() {
        let status = RecoveryStatus::Stalled {
            since: at(0),
            reason: StalledReason::AwaitingHuman { age_secs: 60 },
        };
        match decide_action(status, None) {
            RecoveryAction::EmitStalled { .. } => {}
            other => panic!("expected EmitStalled, got {other:?}"),
        }
    }

    #[test]
    fn decide_action_dedupes_consecutive_stalls() {
        let status = RecoveryStatus::Stalled {
            since: at(0),
            reason: StalledReason::AwaitingHuman { age_secs: 60 },
        };
        assert_eq!(
            decide_action(status, Some(LatestEventTag::Stalled)),
            RecoveryAction::Skip
        );
    }

    #[test]
    fn decide_action_emits_stalled_after_recovered() {
        let status = RecoveryStatus::Stalled {
            since: at(0),
            reason: StalledReason::AwaitingHuman { age_secs: 60 },
        };
        match decide_action(status, Some(LatestEventTag::Recovered)) {
            RecoveryAction::EmitStalled { .. } => {}
            other => panic!("expected EmitStalled, got {other:?}"),
        }
    }

    #[test]
    fn decide_action_emits_recovered_when_prior_was_stalled() {
        assert_eq!(
            decide_action(RecoveryStatus::Healthy, Some(LatestEventTag::Stalled)),
            RecoveryAction::EmitRecovered
        );
    }

    #[test]
    fn decide_action_skips_when_already_healthy() {
        assert_eq!(
            decide_action(RecoveryStatus::Healthy, None),
            RecoveryAction::Skip
        );
        assert_eq!(
            decide_action(RecoveryStatus::Healthy, Some(LatestEventTag::Recovered)),
            RecoveryAction::Skip
        );
    }

    #[test]
    fn terminal_runs_are_always_healthy() {
        let cfg = RecoveryConfig::default();
        for state in [RunState::Completed, RunState::Failed, RunState::Cancelled] {
            let c = candidate(state, 0, None);
            assert_eq!(
                classify(&c, at(60 * 60 * 24), &cfg),
                RecoveryStatus::Healthy
            );
        }
    }

    #[test]
    fn fresh_run_is_healthy() {
        let cfg = RecoveryConfig::default();
        let c = candidate(RunState::Coding, 0, Some(60));
        assert_eq!(classify(&c, at(70), &cfg), RecoveryStatus::Healthy);
    }

    #[test]
    fn waiting_human_30m_idle_is_stalled_with_awaiting_human() {
        let cfg = RecoveryConfig::default();
        let c = candidate(RunState::WaitingHuman, 0, None);
        let status = classify(&c, at(31 * 60), &cfg);
        match status {
            RecoveryStatus::Stalled { reason, .. } => {
                assert!(matches!(reason, StalledReason::AwaitingHuman { .. }));
                assert_eq!(reason.audit_tag(), "awaiting_human");
            }
            other => panic!("expected stalled, got {other:?}"),
        }
    }

    #[test]
    fn coding_5m_silent_is_stalled_with_no_heartbeat() {
        let cfg = RecoveryConfig::default();
        let c = candidate(RunState::Coding, 0, Some(0));
        let status = classify(&c, at(6 * 60), &cfg);
        match status {
            RecoveryStatus::Stalled { reason, .. } => {
                assert!(matches!(
                    reason,
                    StalledReason::NoHeartbeat {
                        state: RunState::Coding,
                        ..
                    }
                ));
                assert_eq!(reason.audit_tag(), "no_heartbeat");
            }
            other => panic!("expected stalled, got {other:?}"),
        }
    }

    #[test]
    fn queued_without_heartbeat_past_threshold_is_never_dispatched() {
        let cfg = RecoveryConfig::default();
        let c = candidate(RunState::Queued, 0, None);
        let status = classify(&c, at(5 * 60), &cfg);
        match status {
            RecoveryStatus::Stalled { reason, .. } => {
                assert!(matches!(
                    reason,
                    StalledReason::NeverDispatched {
                        state: RunState::Queued,
                        ..
                    }
                ));
                assert_eq!(reason.audit_tag(), "no_heartbeat");
            }
            other => panic!("expected stalled, got {other:?}"),
        }
    }

    #[test]
    fn heartbeat_resets_staleness_clock() {
        let cfg = RecoveryConfig::default();
        // Coding state, threshold 5m. updated_at is 1h ago, but heartbeat
        // landed 1m ago — run is healthy because heartbeat is the freshest
        // signal.
        let c = candidate(RunState::Coding, 0, Some(60 * 60 - 60));
        assert_eq!(classify(&c, at(60 * 60), &cfg), RecoveryStatus::Healthy);
    }

    #[test]
    fn unknown_state_falls_back_to_default_threshold() {
        let mut cfg = RecoveryConfig::default();
        cfg.thresholds.clear();
        let c = candidate(RunState::Coding, 0, None);
        // 31m past — exceeds DEFAULT_THRESHOLD (30m) so stalled.
        assert!(classify(&c, at(31 * 60), &cfg).is_stalled());
        // 29m past — within fallback so healthy.
        assert_eq!(classify(&c, at(29 * 60), &cfg), RecoveryStatus::Healthy);
    }

    #[test]
    fn stalled_since_uses_freshest_signal() {
        let cfg = RecoveryConfig::default();
        let c = candidate(RunState::Coding, 0, Some(60));
        match classify(&c, at(10 * 60), &cfg) {
            RecoveryStatus::Stalled { since, .. } => assert_eq!(since, at(60)),
            other => panic!("expected stalled, got {other:?}"),
        }
    }

    #[test]
    fn display_includes_human_units() {
        let r = StalledReason::AwaitingHuman { age_secs: 1845 };
        assert!(r.display().contains("30m"));
        let r = StalledReason::NoHeartbeat {
            state: RunState::Coding,
            age_secs: 45,
        };
        assert!(r.display().contains("45s"));
    }
}
