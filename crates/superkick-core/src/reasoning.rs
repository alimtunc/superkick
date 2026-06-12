//! Reasoning-effort level for a launch step.
//!
//! A persisted, operator-selectable knob describing how hard the provider
//! should think on a step. Providers expose different ranges (Codex caps at
//! `xhigh`, Claude floors at `low`), so [`ReasoningEffort::clamp_for`] maps any
//! stored value into the target provider's range before it reaches argv.

use serde::{Deserialize, Serialize};

use crate::agent::AgentProvider;

/// How much reasoning effort a step requests from its provider. Ordered from
/// least to most; `Medium` is the neutral default.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ReasoningEffort {
    Minimal,
    Low,
    #[default]
    Medium,
    High,
    #[serde(rename = "xhigh")]
    XHigh,
    /// `ultra_code` is the pre-rename tag still present in persisted snapshots.
    #[serde(alias = "ultra_code")]
    Max,
}

const CODEX_OPTIONS: &[ReasoningEffort] = &[
    ReasoningEffort::Minimal,
    ReasoningEffort::Low,
    ReasoningEffort::Medium,
    ReasoningEffort::High,
    ReasoningEffort::XHigh,
];

const CLAUDE_OPTIONS: &[ReasoningEffort] = &[
    ReasoningEffort::Low,
    ReasoningEffort::Medium,
    ReasoningEffort::High,
    ReasoningEffort::XHigh,
    ReasoningEffort::Max,
];

impl ReasoningEffort {
    /// Stable string operators grep for in the audit ledger. Matches the serde
    /// tag and the value persisted in SQLite.
    pub const fn audit_tag(self) -> &'static str {
        match self {
            Self::Minimal => "minimal",
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::XHigh => "xhigh",
            Self::Max => "max",
        }
    }

    /// The efforts a provider's CLI actually accepts, least to most.
    pub const fn options_for(provider: AgentProvider) -> &'static [ReasoningEffort] {
        match provider {
            AgentProvider::Codex => CODEX_OPTIONS,
            AgentProvider::Claude => CLAUDE_OPTIONS,
        }
    }

    /// Map this effort into the provider's supported range, preserving the
    /// nearest intensity.
    pub const fn clamp_for(self, provider: AgentProvider) -> Self {
        match (provider, self) {
            (AgentProvider::Codex, Self::Max) => Self::XHigh,
            (AgentProvider::Claude, Self::Minimal) => Self::Low,
            _ => self,
        }
    }

    /// Value for Codex's `-c model_reasoning_effort=<v>` config override.
    pub const fn codex_config_value(self) -> &'static str {
        self.clamp_for(AgentProvider::Codex).audit_tag()
    }

    /// Value for Claude Code's `--effort <v>` flag.
    pub const fn claude_effort_value(self) -> &'static str {
        self.clamp_for(AgentProvider::Claude).audit_tag()
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

    const ALL: [ReasoningEffort; 6] = [
        ReasoningEffort::Minimal,
        ReasoningEffort::Low,
        ReasoningEffort::Medium,
        ReasoningEffort::High,
        ReasoningEffort::XHigh,
        ReasoningEffort::Max,
    ];

    #[test]
    fn default_is_medium() {
        assert_eq!(ReasoningEffort::default(), ReasoningEffort::Medium);
    }

    #[test]
    fn serde_tag_matches_audit_tag() {
        for effort in ALL {
            let json = serde_json::to_string(&effort).unwrap();
            let back: ReasoningEffort = serde_json::from_str(&json).unwrap();
            assert_eq!(back, effort);
            assert_eq!(json, format!("\"{}\"", effort.audit_tag()));
        }
    }

    #[test]
    fn legacy_ultra_code_tag_parses_as_max() {
        let back: ReasoningEffort = serde_json::from_str("\"ultra_code\"").unwrap();
        assert_eq!(back, ReasoningEffort::Max);
    }

    #[test]
    fn clamp_for_codex_caps_max_at_xhigh() {
        assert_eq!(
            ReasoningEffort::Max.clamp_for(AgentProvider::Codex),
            ReasoningEffort::XHigh
        );
        for effort in ALL.into_iter().filter(|e| *e != ReasoningEffort::Max) {
            assert_eq!(effort.clamp_for(AgentProvider::Codex), effort);
        }
    }

    #[test]
    fn clamp_for_claude_floors_minimal_at_low() {
        assert_eq!(
            ReasoningEffort::Minimal.clamp_for(AgentProvider::Claude),
            ReasoningEffort::Low
        );
        for effort in ALL.into_iter().filter(|e| *e != ReasoningEffort::Minimal) {
            assert_eq!(effort.clamp_for(AgentProvider::Claude), effort);
        }
    }

    #[test]
    fn options_for_match_each_provider_range() {
        assert_eq!(
            ReasoningEffort::options_for(AgentProvider::Codex),
            &[
                ReasoningEffort::Minimal,
                ReasoningEffort::Low,
                ReasoningEffort::Medium,
                ReasoningEffort::High,
                ReasoningEffort::XHigh,
            ]
        );
        assert_eq!(
            ReasoningEffort::options_for(AgentProvider::Claude),
            &[
                ReasoningEffort::Low,
                ReasoningEffort::Medium,
                ReasoningEffort::High,
                ReasoningEffort::XHigh,
                ReasoningEffort::Max,
            ]
        );
    }

    #[test]
    fn cli_values_are_clamped_tags() {
        assert_eq!(ReasoningEffort::Max.codex_config_value(), "xhigh");
        assert_eq!(ReasoningEffort::Minimal.codex_config_value(), "minimal");
        assert_eq!(ReasoningEffort::Minimal.claude_effort_value(), "low");
        assert_eq!(ReasoningEffort::Max.claude_effort_value(), "max");
        assert_eq!(ReasoningEffort::Medium.codex_config_value(), "medium");
        assert_eq!(ReasoningEffort::Medium.claude_effort_value(), "medium");
    }
}
