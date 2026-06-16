//! App-managed provider settings.
//!
//! The persisted, operator-editable configuration for each provider: default
//! model / reasoning / executor, billing label, and sandbox / permission
//! posture. Detection-derived fields (availability / install / auth) are
//! overlaid live from the runtime detector at read time — they are stored as
//! `Unknown` defaults, never as a stale boot snapshot.
//!
//! Codex defaults to the observable structured executor and Claude to the
//! structured `--print` workflow — both subscription-friendly. Interactive PTY
//! is an explicit opt-in (the takeover/escape hatch).

use serde::{Deserialize, Serialize};

use crate::agent::AgentProvider;
use crate::reasoning::ReasoningEffort;
use crate::runner_mode::BillingProfile;
use crate::serde_util::default_true;
use crate::step_executor::StepExecutor;

/// Whether the provider CLI was reachable at last detection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ProviderAvailability {
    Available,
    Unavailable,
    #[default]
    Unknown,
}

/// Whether the provider CLI binary is installed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum InstallState {
    Installed,
    NotInstalled,
    #[default]
    Unknown,
}

/// Whether the provider CLI is authenticated.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AuthState {
    Authenticated,
    Unauthenticated,
    #[default]
    Unknown,
}

/// Filesystem sandbox posture for a provider spawn. Values mirror the Codex
/// `--sandbox` levels; persisted as settings, advisory until wired at spawn.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SandboxPolicy {
    ReadOnly,
    #[default]
    WorkspaceWrite,
    DangerFullAccess,
}

/// Tool-permission posture for a provider spawn. Persisted as settings.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum PermissionPolicy {
    #[default]
    Prompt,
    AcceptEdits,
    BypassPermissions,
}

/// Operator-editable provider configuration plus the last detected runtime
/// state. Storage persists only the configurable fields; the service layer
/// overlays `availability` / `install_state` / `auth_state` from the detector.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderSettings {
    pub provider: AgentProvider,
    #[serde(default)]
    pub availability: ProviderAvailability,
    #[serde(default)]
    pub install_state: InstallState,
    #[serde(default)]
    pub auth_state: AuthState,
    #[serde(default)]
    pub billing_mode: BillingProfile,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    #[serde(default)]
    pub default_reasoning: ReasoningEffort,
    #[serde(default)]
    pub default_executor: StepExecutor,
    #[serde(default)]
    pub sandbox_policy: SandboxPolicy,
    #[serde(default)]
    pub permission_policy: PermissionPolicy,
    /// Whether the provider is offered in the composer at all.
    #[serde(default = "default_true")]
    pub enabled: bool,
}

impl ProviderSettings {
    /// Canonical builtin provider settings. Both providers default to their
    /// structured executor (Codex structured / Claude workflow), seeded with a
    /// `Subscription` billing mode; interactive PTY is an explicit opt-in.
    pub fn builtins() -> Vec<ProviderSettings> {
        vec![
            Self::base(AgentProvider::Codex),
            Self::base(AgentProvider::Claude),
        ]
    }

    fn base(provider: AgentProvider) -> ProviderSettings {
        ProviderSettings {
            provider,
            availability: ProviderAvailability::Unknown,
            install_state: InstallState::Unknown,
            auth_state: AuthState::Unknown,
            billing_mode: BillingProfile::Subscription,
            default_model: None,
            default_reasoning: ReasoningEffort::Medium,
            default_executor: StepExecutor::default_for(provider),
            sandbox_policy: SandboxPolicy::WorkspaceWrite,
            permission_policy: PermissionPolicy::Prompt,
            enabled: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtins_cover_codex_and_claude() {
        let builtins = ProviderSettings::builtins();
        let providers: Vec<_> = builtins.iter().map(|p| p.provider).collect();
        assert_eq!(providers, [AgentProvider::Codex, AgentProvider::Claude]);
    }

    #[test]
    fn claude_default_executor_is_claude_workflow_on_subscription() {
        let claude = ProviderSettings::builtins()
            .into_iter()
            .find(|p| p.provider == AgentProvider::Claude)
            .unwrap();
        assert_eq!(claude.default_executor, StepExecutor::ClaudeWorkflow);
        assert_eq!(claude.billing_mode, BillingProfile::Subscription);
    }

    #[test]
    fn detection_fields_default_to_unknown() {
        let codex = &ProviderSettings::builtins()[0];
        assert_eq!(codex.availability, ProviderAvailability::Unknown);
        assert_eq!(codex.install_state, InstallState::Unknown);
        assert_eq!(codex.auth_state, AuthState::Unknown);
    }

    #[test]
    fn serde_round_trip() {
        for settings in ProviderSettings::builtins() {
            let json = serde_json::to_string(&settings).unwrap();
            let back: ProviderSettings = serde_json::from_str(&json).unwrap();
            assert_eq!(back, settings);
        }
    }
}
