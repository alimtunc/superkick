//! Session continuity policy for a launch step.
//!
//! Describes how a step relates to the session/conversation of the steps
//! around it. The matrix in [`SessionPolicy::is_compatible_with`] keeps a
//! policy from being attached to an executor that can't honour it — e.g.
//! `Resume` only makes sense for `CodexStructured`, the only executor whose
//! `provider_session_id` the runtime captures (SUP-191).

use serde::{Deserialize, Serialize};

use crate::step_executor::StepExecutor;

/// How a step's provider session is established.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SessionPolicy {
    /// Start a brand-new session for the step. The safe default.
    #[default]
    Fresh,
    /// Resume the same provider conversation a prior segment left off (Codex
    /// `exec resume`). Requires a captured `provider_session_id`.
    Resume,
    /// Reuse the immediately-preceding step's live session.
    SameSession,
    /// Reuse a session shared across the whole workflow.
    SameWorkflow,
    /// Hand the step to an operator-driven PTY takeover.
    Takeover,
}

/// Rejection reason for an incompatible `(policy, executor)` pair.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
#[error("session_policy `{policy}` is not supported by executor `{executor}`")]
pub struct SessionPolicyError {
    pub policy: SessionPolicy,
    pub executor: StepExecutor,
}

impl SessionPolicy {
    /// Stable string operators grep for in the audit ledger.
    pub const fn audit_tag(self) -> &'static str {
        match self {
            Self::Fresh => "fresh",
            Self::Resume => "resume",
            Self::SameSession => "same_session",
            Self::SameWorkflow => "same_workflow",
            Self::Takeover => "takeover",
        }
    }

    /// Whether this policy can run under `executor`.
    ///
    /// - `Fresh` works everywhere.
    /// - `Resume` is Codex-structured only (the sole executor with a captured
    ///   `provider_session_id`).
    /// - `SameSession` / `SameWorkflow` need a programmatic session handle, so
    ///   they apply to the structured executors.
    /// - `Takeover` is the interactive-PTY path only.
    pub const fn is_compatible_with(self, executor: StepExecutor) -> bool {
        use SessionPolicy::*;
        use StepExecutor::*;
        matches!(
            (self, executor),
            (Fresh, _)
                | (Resume, CodexStructured)
                | (SameSession | SameWorkflow, CodexStructured | ClaudeWorkflow)
                | (Takeover, InteractivePty)
        )
    }

    /// `Ok(())` when [`is_compatible_with`](Self::is_compatible_with) holds,
    /// otherwise a [`SessionPolicyError`].
    pub const fn validate_with(self, executor: StepExecutor) -> Result<(), SessionPolicyError> {
        if self.is_compatible_with(executor) {
            Ok(())
        } else {
            Err(SessionPolicyError {
                policy: self,
                executor,
            })
        }
    }
}

impl std::fmt::Display for SessionPolicy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.audit_tag())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_fresh() {
        assert_eq!(SessionPolicy::default(), SessionPolicy::Fresh);
    }

    #[test]
    fn fresh_is_compatible_with_every_executor() {
        for executor in [
            StepExecutor::CodexStructured,
            StepExecutor::ClaudeWorkflow,
            StepExecutor::ClaudeBackground,
            StepExecutor::InteractivePty,
            StepExecutor::Future,
        ] {
            assert!(SessionPolicy::Fresh.is_compatible_with(executor));
        }
    }

    #[test]
    fn claude_background_supports_fresh_only() {
        // A `claude --bg` step starts a brand-new background session; it has no
        // captured resume key and no live PTY, so only `Fresh` applies.
        assert!(SessionPolicy::Fresh.is_compatible_with(StepExecutor::ClaudeBackground));
        assert!(!SessionPolicy::Resume.is_compatible_with(StepExecutor::ClaudeBackground));
        assert!(!SessionPolicy::SameSession.is_compatible_with(StepExecutor::ClaudeBackground));
        assert!(!SessionPolicy::SameWorkflow.is_compatible_with(StepExecutor::ClaudeBackground));
        assert!(!SessionPolicy::Takeover.is_compatible_with(StepExecutor::ClaudeBackground));
    }

    #[test]
    fn resume_is_codex_structured_only() {
        assert!(SessionPolicy::Resume.is_compatible_with(StepExecutor::CodexStructured));
        assert!(!SessionPolicy::Resume.is_compatible_with(StepExecutor::ClaudeWorkflow));
        assert!(!SessionPolicy::Resume.is_compatible_with(StepExecutor::InteractivePty));
        assert!(!SessionPolicy::Resume.is_compatible_with(StepExecutor::Future));
    }

    #[test]
    fn takeover_is_interactive_pty_only() {
        assert!(SessionPolicy::Takeover.is_compatible_with(StepExecutor::InteractivePty));
        assert!(!SessionPolicy::Takeover.is_compatible_with(StepExecutor::CodexStructured));
    }

    #[test]
    fn validate_with_surfaces_the_pair() {
        let err = SessionPolicy::Resume
            .validate_with(StepExecutor::ClaudeWorkflow)
            .unwrap_err();
        assert_eq!(err.policy, SessionPolicy::Resume);
        assert_eq!(err.executor, StepExecutor::ClaudeWorkflow);
    }

    #[test]
    fn serde_round_trip_matches_audit_tag() {
        for policy in [
            SessionPolicy::Fresh,
            SessionPolicy::Resume,
            SessionPolicy::SameSession,
            SessionPolicy::SameWorkflow,
            SessionPolicy::Takeover,
        ] {
            let json = serde_json::to_string(&policy).unwrap();
            let back: SessionPolicy = serde_json::from_str(&json).unwrap();
            assert_eq!(back, policy);
            assert_eq!(json, format!("\"{}\"", policy.audit_tag()));
        }
    }
}
