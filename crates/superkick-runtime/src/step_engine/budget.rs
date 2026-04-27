//! Pure budget-tripwire logic (SUP-72).
//!
//! Takes a snapshot (budget + observed counters + `started_at`) and returns
//! the first dimension that has tripped, if any. Extracted from `step_engine`
//! so the math is independent of storage and easily unit-tested.

use chrono::{DateTime, Utc};
use superkick_core::{RunBudget, RunBudgetGrant};

/// Which budget dimension ran over.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BudgetDimension {
    Duration,
    Retries,
    Tokens,
}

impl BudgetDimension {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Duration => "duration",
            Self::Retries => "retries",
            Self::Tokens => "tokens",
        }
    }
}

/// Outcome of a tripwire check.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BudgetTrip {
    pub dimension: BudgetDimension,
    /// Measured value at check time (seconds / count / tokens).
    pub observed: u64,
    /// Configured ceiling for the tripped dimension.
    pub limit: u64,
}

impl BudgetTrip {
    /// Human-readable reason. Shown in the pause banner + `pause_reason`.
    #[must_use]
    pub fn reason(&self) -> String {
        match self.dimension {
            BudgetDimension::Duration => {
                format!("duration exceeded: {}s / {}s", self.observed, self.limit)
            }
            BudgetDimension::Retries => format!(
                "retry budget exhausted: {} / {} retries used",
                self.observed, self.limit
            ),
            BudgetDimension::Tokens => format!(
                "token ceiling exceeded: {} / {} tokens",
                self.observed, self.limit
            ),
        }
    }
}

/// Counters observed at check time. `tokens_observed = None` means no
/// integration reported token usage for this run — we skip the token check
/// rather than treat it as zero.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BudgetSnapshot {
    pub now: DateTime<Utc>,
    pub started_at: DateTime<Utc>,
    pub retries_observed: u32,
    pub tokens_observed: Option<u64>,
}

/// Checks each configured dimension in order, after subtracting the cumulative
/// override grant from the observed values. Returns the first trip found so
/// the operator sees exactly one reason at a time.
///
/// `grant` is the snapshot of observed values captured at the most recent
/// operator override. Subtracting it ensures an override resets the budget
/// window per-dimension — without it, the next gate would re-trip on the same
/// counters and the operator would loop.
#[must_use]
pub fn evaluate(
    budget: &RunBudget,
    snapshot: &BudgetSnapshot,
    grant: &RunBudgetGrant,
) -> Option<BudgetTrip> {
    if let Some(limit) = budget.duration_secs {
        let elapsed = snapshot
            .now
            .signed_duration_since(snapshot.started_at)
            .num_seconds()
            .max(0) as u64;
        let effective = elapsed.saturating_sub(grant.duration_secs);
        if effective > limit {
            return Some(BudgetTrip {
                dimension: BudgetDimension::Duration,
                observed: elapsed,
                limit,
            });
        }
    }

    if let Some(limit) = budget.retries_max {
        let effective =
            u64::from(snapshot.retries_observed).saturating_sub(u64::from(grant.retries));
        if effective > u64::from(limit) {
            return Some(BudgetTrip {
                dimension: BudgetDimension::Retries,
                observed: u64::from(snapshot.retries_observed),
                limit: u64::from(limit),
            });
        }
    }

    if let (Some(limit), Some(observed)) = (budget.token_ceiling, snapshot.tokens_observed) {
        let effective = observed.saturating_sub(grant.tokens);
        if effective > limit {
            return Some(BudgetTrip {
                dimension: BudgetDimension::Tokens,
                observed,
                limit,
            });
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    fn snapshot(elapsed_secs: i64, retries: u32, tokens: Option<u64>) -> BudgetSnapshot {
        let now = Utc::now();
        BudgetSnapshot {
            now,
            started_at: now - Duration::seconds(elapsed_secs),
            retries_observed: retries,
            tokens_observed: tokens,
        }
    }

    #[test]
    fn empty_budget_never_trips() {
        let b = RunBudget::default();
        assert!(
            evaluate(
                &b,
                &snapshot(10_000, 100, Some(10_000_000)),
                &RunBudgetGrant::default()
            )
            .is_none()
        );
    }

    #[test]
    fn duration_trips_when_over() {
        let b = RunBudget {
            duration_secs: Some(60),
            ..Default::default()
        };
        let trip =
            evaluate(&b, &snapshot(75, 0, None), &RunBudgetGrant::default()).expect("should trip");
        assert_eq!(trip.dimension, BudgetDimension::Duration);
        assert_eq!(trip.limit, 60);
        assert!(trip.observed >= 75);
    }

    #[test]
    fn retries_trip_when_over() {
        let b = RunBudget {
            retries_max: Some(3),
            ..Default::default()
        };
        let trip =
            evaluate(&b, &snapshot(0, 4, None), &RunBudgetGrant::default()).expect("should trip");
        assert_eq!(trip.dimension, BudgetDimension::Retries);
        assert_eq!(trip.observed, 4);
        assert_eq!(trip.limit, 3);
    }

    #[test]
    fn tokens_skipped_when_unknown() {
        let b = RunBudget {
            token_ceiling: Some(1_000),
            ..Default::default()
        };
        assert!(evaluate(&b, &snapshot(0, 0, None), &RunBudgetGrant::default()).is_none());
    }

    #[test]
    fn tokens_trip_when_known_and_over() {
        let b = RunBudget {
            token_ceiling: Some(1_000),
            ..Default::default()
        };
        let trip = evaluate(&b, &snapshot(0, 0, Some(1_500)), &RunBudgetGrant::default())
            .expect("should trip");
        assert_eq!(trip.dimension, BudgetDimension::Tokens);
    }

    #[test]
    fn duration_is_checked_first() {
        let b = RunBudget {
            duration_secs: Some(1),
            retries_max: Some(1),
            token_ceiling: Some(1),
        };
        let trip = evaluate(
            &b,
            &snapshot(100, 100, Some(100_000)),
            &RunBudgetGrant::default(),
        )
        .expect("should trip");
        assert_eq!(trip.dimension, BudgetDimension::Duration);
    }

    #[test]
    fn grant_resets_duration_window() {
        // Limit 60s, observed 75s, grant 75s — effective elapsed is 0.
        // Operator-override semantics: a fresh full budget window from override.
        let b = RunBudget {
            duration_secs: Some(60),
            ..Default::default()
        };
        let grant = RunBudgetGrant {
            duration_secs: 75,
            ..Default::default()
        };
        assert!(evaluate(&b, &snapshot(75, 0, None), &grant).is_none());
    }

    #[test]
    fn grant_only_skips_acknowledged_dimensions() {
        // Operator overrode duration at 75s, but retries are still over the
        // limit — that dimension must still trip on the next gate.
        let b = RunBudget {
            duration_secs: Some(60),
            retries_max: Some(3),
            ..Default::default()
        };
        let grant = RunBudgetGrant {
            duration_secs: 75,
            retries: 0,
            tokens: 0,
        };
        let trip = evaluate(&b, &snapshot(75, 5, None), &grant).expect("retries should still trip");
        assert_eq!(trip.dimension, BudgetDimension::Retries);
    }
}
