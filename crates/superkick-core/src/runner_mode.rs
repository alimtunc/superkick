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
    /// Subscription-backed for now, subject to Anthropic policy changes.
    /// Process exits when the response stream ends.
    PrintStreamJson,
    /// Codex-only headless path via the `exec` subcommand.
    ExecJson,
    /// Claude-only detached autonomous path via `claude --bg`. Superkick
    /// launches a named background session from the worktree `cwd` (never
    /// `--cwd`), polls `claude agents --json` for coarse state, reads
    /// `claude logs` for best-effort evidence, cancels via `claude stop`.
    /// Believed subscription-billed (local evidence, not externally proven).
    BackgroundSession,
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
            Self::BackgroundSession => "background_session",
        }
    }

    /// Default mode for a freshly-loaded agent when YAML omits `runner_mode`.
    pub const fn default_for(provider: AgentProvider) -> Self {
        match provider {
            AgentProvider::Claude => Self::PrintStreamJson,
            AgentProvider::Codex => Self::ExecJson,
        }
    }

    /// Reject `(provider, mode)` pairs that have no runner implementation.
    pub const fn validate_with(self, provider: AgentProvider) -> Result<(), RunnerModeError> {
        match (provider, self) {
            // `BackgroundSession` is Claude-only (`claude --bg`); Codex has no
            // equivalent. `ExecJson` is Codex-only.
            (AgentProvider::Claude, Self::ExecJson)
            | (AgentProvider::Codex, Self::PrintStreamJson)
            | (AgentProvider::Codex, Self::BackgroundSession) => {
                Err(RunnerModeError::Incompatible {
                    mode: self,
                    provider,
                })
            }
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
            "background_session" => Ok(Self::BackgroundSession),
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
            // Subscription-backed for now, subject to Anthropic policy changes.
            (AgentProvider::Claude, RunnerMode::PrintStreamJson) => Self::Subscription,
            (AgentProvider::Claude, RunnerMode::InteractivePty) => Self::Subscription,
            // `claude --bg` runs on the local subscription, not Agent SDK credits.
            (AgentProvider::Claude, RunnerMode::BackgroundSession) => Self::Subscription,
            (AgentProvider::Codex, RunnerMode::ExecJson) => Self::Subscription,
            (AgentProvider::Codex, RunnerMode::InteractivePty) => Self::Subscription,
            _ => Self::Unknown,
        }
    }

    /// Apply the `(provider, mode, override)` desugaring rule: an explicit
    /// override wins, otherwise the `(provider, mode)` default applies. Claude
    /// `print_stream_json` is subscription-backed for now (subject to Anthropic
    /// policy changes) and no longer force-pinned, so an explicit override is
    /// honored.
    pub fn resolve(provider: AgentProvider, mode: RunnerMode, override_: Option<Self>) -> Self {
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
    fn runner_mode_default_for_claude_is_print_stream_json() {
        assert_eq!(
            RunnerMode::default_for(AgentProvider::Claude),
            RunnerMode::PrintStreamJson
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
    fn billing_profile_default_claude_print_is_subscription() {
        assert_eq!(
            BillingProfile::default_for(AgentProvider::Claude, RunnerMode::PrintStreamJson),
            BillingProfile::Subscription
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
    fn validate_with_accepts_claude_background_session() {
        assert!(
            RunnerMode::BackgroundSession
                .validate_with(AgentProvider::Claude)
                .is_ok()
        );
    }

    #[test]
    fn validate_with_rejects_codex_background_session() {
        assert!(
            RunnerMode::BackgroundSession
                .validate_with(AgentProvider::Codex)
                .is_err()
        );
    }

    #[test]
    fn billing_profile_default_claude_background_is_subscription() {
        assert_eq!(
            BillingProfile::default_for(AgentProvider::Claude, RunnerMode::BackgroundSession),
            BillingProfile::Subscription
        );
    }

    #[test]
    fn billing_profile_resolve_background_defaults_to_subscription() {
        assert_eq!(
            BillingProfile::resolve(AgentProvider::Claude, RunnerMode::BackgroundSession, None),
            BillingProfile::Subscription
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
            RunnerMode::BackgroundSession,
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
    fn billing_profile_resolve_honors_override_on_claude_print() {
        // The old force-pin is gone: an explicit override on
        // `claude + print_stream_json` is now honored, not overridden.
        assert_eq!(
            BillingProfile::resolve(
                AgentProvider::Claude,
                RunnerMode::PrintStreamJson,
                Some(BillingProfile::AgentSdkCredits),
            ),
            BillingProfile::AgentSdkCredits
        );
    }

    #[test]
    fn billing_profile_resolve_claude_print_defaults_to_subscription() {
        assert_eq!(
            BillingProfile::resolve(AgentProvider::Claude, RunnerMode::PrintStreamJson, None),
            BillingProfile::Subscription
        );
    }

    #[test]
    fn billing_profile_resolve_honors_override_when_not_forced() {
        assert_eq!(
            BillingProfile::resolve(
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
            BillingProfile::resolve(AgentProvider::Claude, RunnerMode::InteractivePty, None),
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
