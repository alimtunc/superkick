//! How a launch step is executed.
//!
//! `StepExecutor` is a product-facing label resolved **onto the existing
//! `(provider, RunnerMode)` axis** — it does not introduce a parallel
//! execution model. `ClaudeWorkflow` resolves to `(Claude, PrintStreamJson)`,
//! the structured Claude print path — subscription-backed for now, subject to
//! Anthropic policy changes. Codex structured and Claude workflow are the
//! subscription-friendly per-provider defaults; interactive PTY is the
//! takeover/escape hatch.

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
    /// Claude `--print --output-format stream-json`. The default Claude
    /// executor; subscription-backed for now, subject to Anthropic policy
    /// changes.
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
    /// [`RunnerMode::default_for`] at the product-label layer: Codex →
    /// structured, Claude → workflow (`--print` structured) — both
    /// subscription-friendly. Interactive PTY stays an explicit opt-in.
    pub const fn default_for(provider: AgentProvider) -> Self {
        match provider {
            AgentProvider::Codex => Self::CodexStructured,
            AgentProvider::Claude => Self::ClaudeWorkflow,
        }
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
    fn default_for_claude_is_claude_workflow() {
        assert_eq!(
            StepExecutor::default_for(AgentProvider::Claude),
            StepExecutor::ClaudeWorkflow
        );
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
