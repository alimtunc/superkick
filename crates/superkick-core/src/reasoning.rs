//! Reasoning-effort level for a launch step.
//!
//! A persisted, operator-selectable knob describing how hard the provider
//! should think on a step. V1 stores and surfaces the choice but does not yet
//! translate it into provider CLI flags: neither the Codex nor the Claude CLI
//! in use exposes a machine-confirmed reasoning-effort switch, so fabricating a
//! flag would misreport a capability we do not have. Wiring the concrete
//! switches is a fast-follow once each provider's flag is confirmed.

use serde::{Deserialize, Serialize};

/// How much reasoning effort a step requests from its provider. Ordered from
/// least to most; `Medium` is the neutral default.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ReasoningEffort {
    Low,
    #[default]
    Medium,
    High,
    #[serde(rename = "xhigh")]
    XHigh,
    #[serde(rename = "ultra_code")]
    UltraCode,
}

impl ReasoningEffort {
    /// Stable string operators grep for in the audit ledger. Matches the serde
    /// tag and the value persisted in SQLite.
    pub const fn audit_tag(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::XHigh => "xhigh",
            Self::UltraCode => "ultra_code",
        }
    }
}

impl std::fmt::Display for ReasoningEffort {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.audit_tag())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_medium() {
        assert_eq!(ReasoningEffort::default(), ReasoningEffort::Medium);
    }

    #[test]
    fn serde_tag_matches_audit_tag() {
        for effort in [
            ReasoningEffort::Low,
            ReasoningEffort::Medium,
            ReasoningEffort::High,
            ReasoningEffort::XHigh,
            ReasoningEffort::UltraCode,
        ] {
            let json = serde_json::to_string(&effort).unwrap();
            let back: ReasoningEffort = serde_json::from_str(&json).unwrap();
            assert_eq!(back, effort);
            assert_eq!(json, format!("\"{}\"", effort.audit_tag()));
        }
    }
}
