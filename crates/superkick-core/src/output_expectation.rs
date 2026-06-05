//! What a launch step is expected to produce.
//!
//! Declarative metadata used by the composer/UI and the runtime's step-result
//! handling. It does not gate execution; it labels the intended artifact so a
//! dynamic step list reads coherently (a `Review` step expects a review, not a
//! patch) and so disabled or `NoOp` steps are obvious in the plan strip.

use serde::{Deserialize, Serialize};

/// The artifact a step is expected to yield.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum OutputExpectation {
    /// An implementation plan.
    Plan,
    /// A code change / diff.
    #[default]
    Patch,
    /// A review verdict over an existing change.
    Review,
    /// A free-form comment posted back to the issue.
    Comment,
    /// No artifact — a structural / placeholder step.
    NoOp,
}

impl OutputExpectation {
    /// Stable string operators grep for in the audit ledger.
    pub const fn audit_tag(self) -> &'static str {
        match self {
            Self::Plan => "plan",
            Self::Patch => "patch",
            Self::Review => "review",
            Self::Comment => "comment",
            Self::NoOp => "no_op",
        }
    }
}

impl std::fmt::Display for OutputExpectation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.audit_tag())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_patch() {
        assert_eq!(OutputExpectation::default(), OutputExpectation::Patch);
    }

    #[test]
    fn serde_round_trip_matches_audit_tag() {
        for expectation in [
            OutputExpectation::Plan,
            OutputExpectation::Patch,
            OutputExpectation::Review,
            OutputExpectation::Comment,
            OutputExpectation::NoOp,
        ] {
            let json = serde_json::to_string(&expectation).unwrap();
            let back: OutputExpectation = serde_json::from_str(&json).unwrap();
            assert_eq!(back, expectation);
            assert_eq!(json, format!("\"{}\"", expectation.audit_tag()));
        }
    }
}
