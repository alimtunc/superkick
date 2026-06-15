//! How a launch step is executed.
//!
//! `StepExecutor` is a product-facing label resolved **onto the existing
//! `(provider, RunnerMode)` axis** — it does not introduce a parallel
//! execution model. The mapping keeps billing honest: `ClaudeWorkflow` is the only
//! executor that resolves to `(Claude, PrintStreamJson)`, the single path that
//! `BillingProfile::resolve` forces to `AgentSdkCredits`. Codex-structured is
//! the subscription-friendly default; Claude workflow is opt-in.

use serde::{Deserialize, Serialize};

use crate::agent::AgentProvider;
use crate::runner_mode::RunnerMode;

/// Execution strategy for one step. `Future` is a forward-compatible sentinel
/// for executors not yet implemented (e.g. an ACP harness); it resolves to no
/// concrete spawn shape and must be rejected at compose time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum StepExecutor {
    /// Codex `exec --json`. Observable, subscription-billed. Default.
    #[default]
    CodexStructured,
    /// Claude `--print --output-format stream-json`. Opt-in; consumes Agent
    /// SDK credits.
    ClaudeWorkflow,
    /// Claude `--bg` detached background session: Superkick polls
    /// `claude agents --json` for state and reads `claude logs` for evidence.
    /// See [`RunnerMode::BackgroundSession`].
    ClaudeBackground,
    /// Provider CLI over a live PTY the operator can attach to.
    InteractivePty,
    /// Not-yet-implemented executor. Reserved so persisted snapshots can name
    /// a future strategy without a migration.
    Future,
}

impl StepExecutor {
    /// Stable string operators grep for in the audit ledger.
    pub const fn audit_tag(self) -> &'static str {
        match self {
            Self::CodexStructured => "codex_structured",
            Self::ClaudeWorkflow => "claude_workflow",
            Self::ClaudeBackground => "claude_background",
            Self::InteractivePty => "interactive_pty",
            Self::Future => "future",
        }
    }

    /// The `RunnerMode` this executor resolves to. `None` for `Future`, which
    /// has no spawn shape yet.
    pub const fn runner_mode(self) -> Option<RunnerMode> {
        match self {
            Self::CodexStructured => Some(RunnerMode::ExecJson),
            Self::ClaudeWorkflow => Some(RunnerMode::PrintStreamJson),
            Self::ClaudeBackground => Some(RunnerMode::BackgroundSession),
            Self::InteractivePty => Some(RunnerMode::InteractivePty),
            Self::Future => None,
        }
    }

    /// The product-label executor for a concrete `RunnerMode` — the inverse of
    /// [`Self::runner_mode`]. Used by surfaces that store only `runner_mode`
    /// (agents) but present an executor select.
    pub const fn from_runner_mode(mode: RunnerMode) -> Self {
        match mode {
            RunnerMode::ExecJson => Self::CodexStructured,
            RunnerMode::PrintStreamJson => Self::ClaudeWorkflow,
            RunnerMode::BackgroundSession => Self::ClaudeBackground,
            RunnerMode::InteractivePty => Self::InteractivePty,
        }
    }

    /// Default executor for a freshly-configured provider. Mirrors
    /// [`RunnerMode::default_for`] but at the product-label layer: Codex →
    /// structured (subscription default), Claude → interactive PTY (so the
    /// paid `ClaudeWorkflow` path is never selected silently).
    pub const fn default_for(provider: AgentProvider) -> Self {
        match provider {
            AgentProvider::Codex => Self::CodexStructured,
            AgentProvider::Claude => Self::InteractivePty,
        }
    }

    /// Whether selecting this executor consumes paid Agent SDK credits. Used
    /// by the UI/billing-label surface to keep the billing label visible.
    pub const fn is_paid_sdk(self) -> bool {
        matches!(self, Self::ClaudeWorkflow)
    }
}

impl std::fmt::Display for StepExecutor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.audit_tag())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_codex_structured() {
        assert_eq!(StepExecutor::default(), StepExecutor::CodexStructured);
    }

    #[test]
    fn claude_workflow_is_the_only_paid_sdk_path() {
        assert!(StepExecutor::ClaudeWorkflow.is_paid_sdk());
        assert!(!StepExecutor::CodexStructured.is_paid_sdk());
        // The background path is subscription-billed, not Agent SDK credits.
        assert!(!StepExecutor::ClaudeBackground.is_paid_sdk());
        assert!(!StepExecutor::InteractivePty.is_paid_sdk());
        assert!(!StepExecutor::Future.is_paid_sdk());
    }

    #[test]
    fn resolves_onto_runner_mode_axis() {
        assert_eq!(
            StepExecutor::CodexStructured.runner_mode(),
            Some(RunnerMode::ExecJson)
        );
        assert_eq!(
            StepExecutor::ClaudeWorkflow.runner_mode(),
            Some(RunnerMode::PrintStreamJson)
        );
        assert_eq!(
            StepExecutor::ClaudeBackground.runner_mode(),
            Some(RunnerMode::BackgroundSession)
        );
        assert_eq!(
            StepExecutor::InteractivePty.runner_mode(),
            Some(RunnerMode::InteractivePty)
        );
        assert_eq!(StepExecutor::Future.runner_mode(), None);
    }

    #[test]
    fn default_for_keeps_claude_off_the_paid_path() {
        assert_eq!(
            StepExecutor::default_for(AgentProvider::Claude),
            StepExecutor::InteractivePty
        );
        assert!(!StepExecutor::default_for(AgentProvider::Claude).is_paid_sdk());
        assert_eq!(
            StepExecutor::default_for(AgentProvider::Codex),
            StepExecutor::CodexStructured
        );
    }

    #[test]
    fn serde_round_trip_matches_audit_tag() {
        for executor in [
            StepExecutor::CodexStructured,
            StepExecutor::ClaudeWorkflow,
            StepExecutor::ClaudeBackground,
            StepExecutor::InteractivePty,
            StepExecutor::Future,
        ] {
            let json = serde_json::to_string(&executor).unwrap();
            let back: StepExecutor = serde_json::from_str(&json).unwrap();
            assert_eq!(back, executor);
            assert_eq!(json, format!("\"{}\"", executor.audit_tag()));
        }
    }
}
