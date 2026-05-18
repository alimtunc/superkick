//! Runner-mode + billing-profile metadata.
//!
//! Two orthogonal axes describing how a provider CLI is spawned and which
//! credit pool the spawn consumes. Both are first-class fields on
//! `AgentDefinition` / `ResolvedAgent` so the invocation shape becomes
//! inspectable data rather than a hard-coded branch in the runner.

use serde::{Deserialize, Serialize};

use crate::agent::AgentProvider;

/// How the provider CLI is spawned. Orthogonal to [`crate::AgentBackend`]
/// (which models *what* the agent does — protocol vs sub-agent vs skill);
/// the two combine multiplicatively.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RunnerMode {
    /// Spawn the provider CLI with no completion flag and inject the prompt
    /// over PTY stdin after the child is alive. The operator can attach to
    /// the live PTY at any time. Process exits only on operator cancel,
    /// timeout, or operator `/exit`.
    #[default]
    InteractivePty,
    /// Claude-only headless path with `--print --output-format stream-json`.
    /// Consumes Anthropic Agent SDK credits. Process exits when the response
    /// stream ends.
    PrintStreamJson,
    /// Codex-only headless path via the `exec` subcommand.
    ExecJson,
}

/// Which credit pool a spawn consumes. Declarative metadata, not a runtime
/// gate.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum BillingProfile {
    /// Operator local CLI subscription (Claude Code, ChatGPT Plus).
    Subscription,
    /// Anthropic Agent SDK quota.
    AgentSdkCredits,
    /// Provider HTTP API keys. Reserved for a future HTTP harness.
    ApiCredits,
    /// Sentinel for unknown / legacy rows.
    #[default]
    Unknown,
}

/// Validation errors for `(provider, runner_mode)` pairs.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum RunnerModeError {
    #[error("runner_mode `{mode}` is not supported by provider `{provider}`")]
    Incompatible {
        mode: RunnerMode,
        provider: AgentProvider,
    },
}

impl RunnerMode {
    /// Stable string operators grep for in the audit ledger.
    pub const fn audit_tag(self) -> &'static str {
        match self {
            Self::InteractivePty => "interactive_pty",
            Self::PrintStreamJson => "print_stream_json",
            Self::ExecJson => "exec_json",
        }
    }

    /// Default mode for a freshly-loaded agent when YAML omits `runner_mode`.
    pub const fn default_for(provider: AgentProvider) -> Self {
        match provider {
            AgentProvider::Claude => Self::InteractivePty,
            AgentProvider::Codex => Self::ExecJson,
        }
    }

    /// Reject `(provider, mode)` pairs that have no runner implementation.
    pub const fn validate_with(self, provider: AgentProvider) -> Result<(), RunnerModeError> {
        match (provider, self) {
            (AgentProvider::Claude, Self::ExecJson)
            | (AgentProvider::Codex, Self::PrintStreamJson) => Err(RunnerModeError::Incompatible {
                mode: self,
                provider,
            }),
            _ => Ok(()),
        }
    }
}

impl std::fmt::Display for RunnerMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.audit_tag())
    }
}

impl std::str::FromStr for RunnerMode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "interactive_pty" => Ok(Self::InteractivePty),
            "print_stream_json" => Ok(Self::PrintStreamJson),
            "exec_json" => Ok(Self::ExecJson),
            other => Err(format!("unknown runner_mode `{other}`")),
        }
    }
}

impl BillingProfile {
    pub const fn audit_tag(self) -> &'static str {
        match self {
            Self::Subscription => "subscription",
            Self::AgentSdkCredits => "agent_sdk_credits",
            Self::ApiCredits => "api_credits",
            Self::Unknown => "unknown",
        }
    }

    /// Default billing profile derived from `(provider, mode)`.
    pub const fn default_for(provider: AgentProvider, mode: RunnerMode) -> Self {
        match (provider, mode) {
            (AgentProvider::Claude, RunnerMode::PrintStreamJson) => Self::AgentSdkCredits,
            (AgentProvider::Claude, RunnerMode::InteractivePty) => Self::Subscription,
            (AgentProvider::Codex, RunnerMode::ExecJson) => Self::Subscription,
            (AgentProvider::Codex, RunnerMode::InteractivePty) => Self::Subscription,
            _ => Self::Unknown,
        }
    }

    /// Apply the `(provider, mode, override)` desugaring rule, including the
    /// `claude + print_stream_json → agent_sdk_credits` forced invariant. An
    /// override that disagrees with the forced billing is logged at WARN
    /// rather than rejected, so older `superkick.yaml` files keep loading.
    /// `role` is used as a log label only.
    pub fn resolve(
        role: &str,
        provider: AgentProvider,
        mode: RunnerMode,
        override_: Option<Self>,
    ) -> Self {
        if matches!(
            (provider, mode),
            (AgentProvider::Claude, RunnerMode::PrintStreamJson)
        ) {
            if let Some(attempted) = override_
                && attempted != Self::AgentSdkCredits
            {
                tracing::warn!(
                    agent = %role,
                    attempted = %attempted,
                    "ignoring billing_profile override on claude+print_stream_json — forced to agent_sdk_credits"
                );
            }
            return Self::AgentSdkCredits;
        }
        override_.unwrap_or_else(|| Self::default_for(provider, mode))
    }
}

impl std::fmt::Display for BillingProfile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.audit_tag())
    }
}

impl std::str::FromStr for BillingProfile {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "subscription" => Ok(Self::Subscription),
            "agent_sdk_credits" => Ok(Self::AgentSdkCredits),
            "api_credits" => Ok(Self::ApiCredits),
            "unknown" => Ok(Self::Unknown),
            other => Err(format!("unknown billing_profile `{other}`")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runner_mode_default_for_claude_is_interactive_pty() {
        assert_eq!(
            RunnerMode::default_for(AgentProvider::Claude),
            RunnerMode::InteractivePty
        );
    }

    #[test]
    fn runner_mode_default_for_codex_is_exec_json() {
        assert_eq!(
            RunnerMode::default_for(AgentProvider::Codex),
            RunnerMode::ExecJson
        );
    }

    #[test]
    fn billing_profile_default_claude_interactive_is_subscription() {
        assert_eq!(
            BillingProfile::default_for(AgentProvider::Claude, RunnerMode::InteractivePty),
            BillingProfile::Subscription
        );
    }

    #[test]
    fn billing_profile_default_claude_print_is_agent_sdk_credits() {
        assert_eq!(
            BillingProfile::default_for(AgentProvider::Claude, RunnerMode::PrintStreamJson),
            BillingProfile::AgentSdkCredits
        );
    }

    #[test]
    fn billing_profile_default_codex_exec_is_subscription() {
        assert_eq!(
            BillingProfile::default_for(AgentProvider::Codex, RunnerMode::ExecJson),
            BillingProfile::Subscription
        );
    }

    #[test]
    fn validate_with_rejects_claude_exec_json() {
        assert!(
            RunnerMode::ExecJson
                .validate_with(AgentProvider::Claude)
                .is_err()
        );
    }

    #[test]
    fn validate_with_rejects_codex_print_stream_json() {
        assert!(
            RunnerMode::PrintStreamJson
                .validate_with(AgentProvider::Codex)
                .is_err()
        );
    }

    #[test]
    fn validate_with_accepts_claude_interactive_and_print() {
        assert!(
            RunnerMode::InteractivePty
                .validate_with(AgentProvider::Claude)
                .is_ok()
        );
        assert!(
            RunnerMode::PrintStreamJson
                .validate_with(AgentProvider::Claude)
                .is_ok()
        );
    }

    #[test]
    fn validate_with_accepts_codex_interactive_and_exec() {
        assert!(
            RunnerMode::InteractivePty
                .validate_with(AgentProvider::Codex)
                .is_ok()
        );
        assert!(
            RunnerMode::ExecJson
                .validate_with(AgentProvider::Codex)
                .is_ok()
        );
    }

    #[test]
    fn runner_mode_serde_round_trip() {
        for mode in [
            RunnerMode::InteractivePty,
            RunnerMode::PrintStreamJson,
            RunnerMode::ExecJson,
        ] {
            let json = serde_json::to_string(&mode).unwrap();
            let back: RunnerMode = serde_json::from_str(&json).unwrap();
            assert_eq!(back, mode);
            assert!(
                json.contains(mode.audit_tag()),
                "serde tag matches audit tag for {mode:?}"
            );
        }
    }

    #[test]
    fn billing_profile_resolve_forces_agent_sdk_credits_for_claude_print() {
        assert_eq!(
            BillingProfile::resolve(
                "r",
                AgentProvider::Claude,
                RunnerMode::PrintStreamJson,
                Some(BillingProfile::Subscription),
            ),
            BillingProfile::AgentSdkCredits
        );
    }

    #[test]
    fn billing_profile_resolve_honors_override_when_not_forced() {
        assert_eq!(
            BillingProfile::resolve(
                "r",
                AgentProvider::Codex,
                RunnerMode::ExecJson,
                Some(BillingProfile::ApiCredits),
            ),
            BillingProfile::ApiCredits
        );
    }

    #[test]
    fn billing_profile_resolve_falls_back_to_default_for() {
        assert_eq!(
            BillingProfile::resolve("r", AgentProvider::Claude, RunnerMode::InteractivePty, None),
            BillingProfile::Subscription
        );
    }

    #[test]
    fn billing_profile_serde_round_trip() {
        for profile in [
            BillingProfile::Subscription,
            BillingProfile::AgentSdkCredits,
            BillingProfile::ApiCredits,
            BillingProfile::Unknown,
        ] {
            let json = serde_json::to_string(&profile).unwrap();
            let back: BillingProfile = serde_json::from_str(&json).unwrap();
            assert_eq!(back, profile);
            assert!(
                json.contains(profile.audit_tag()),
                "serde tag matches audit tag for {profile:?}"
            );
        }
    }
}
