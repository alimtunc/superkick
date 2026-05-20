//! SUP-154 — operator interventions on a running Launch Task.
//!
//! A free-text request the operator leaves for a Launch Task without taking
//! over the PTY. Persisted; surfaced to the agent at the next prompt
//! injection point; marked consumed when the next step actually starts.
//!
//! Distinct from `AttentionRequest`: that aggregate is run-scoped, structured
//! (kind/options/reply), and waits for an arbitration. An intervention is
//! launch-task-scoped, free-form, and fire-and-forget.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::CoreError;
use crate::id::{LaunchTaskId, LaunchTaskInterventionId, LaunchTaskStepId};

/// Default author when none is supplied (v1: single-operator local tool).
pub const DEFAULT_INTERVENTION_AUTHOR: &str = "operator";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LaunchTaskIntervention {
    pub id: LaunchTaskInterventionId,
    pub launch_task_id: LaunchTaskId,
    /// `None` = next step that runs. `Some` = the specific upcoming step.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_step_id: Option<LaunchTaskStepId>,
    pub author: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub consumed_at: Option<DateTime<Utc>>,
}

impl LaunchTaskIntervention {
    /// Build a fresh intervention. Trims `body` and rejects an empty one.
    /// Falls back to `DEFAULT_INTERVENTION_AUTHOR` when `author` is empty.
    pub fn new(
        launch_task_id: LaunchTaskId,
        target_step_id: Option<LaunchTaskStepId>,
        author: Option<String>,
        body: String,
    ) -> Result<Self, CoreError> {
        let trimmed = body.trim();
        if trimmed.is_empty() {
            return Err(CoreError::InvalidInput(
                "intervention body must not be empty".into(),
            ));
        }
        let author = author
            .map(|a| a.trim().to_string())
            .filter(|a| !a.is_empty())
            .unwrap_or_else(|| DEFAULT_INTERVENTION_AUTHOR.to_string());
        Ok(Self {
            id: LaunchTaskInterventionId::new(),
            launch_task_id,
            target_step_id,
            author,
            body: trimmed.to_string(),
            created_at: Utc::now(),
            consumed_at: None,
        })
    }

    pub fn is_pending(&self) -> bool {
        self.consumed_at.is_none()
    }

    /// Stamp `consumed_at`. Idempotent — re-stamping is a no-op so the
    /// runtime can call this without checking the current state.
    pub fn mark_consumed(&mut self, at: DateTime<Utc>) {
        if self.consumed_at.is_none() {
            self.consumed_at = Some(at);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn task_id() -> LaunchTaskId {
        LaunchTaskId::new()
    }

    #[test]
    fn new_trims_body_and_defaults_author() {
        let i =
            LaunchTaskIntervention::new(task_id(), None, None, "  fix the tests  ".into()).unwrap();
        assert_eq!(i.body, "fix the tests");
        assert_eq!(i.author, DEFAULT_INTERVENTION_AUTHOR);
        assert!(i.is_pending());
    }

    #[test]
    fn new_rejects_empty_body() {
        let err = LaunchTaskIntervention::new(task_id(), None, None, "   ".into()).unwrap_err();
        assert!(matches!(err, CoreError::InvalidInput(_)));
    }

    #[test]
    fn mark_consumed_is_idempotent() {
        let mut i = LaunchTaskIntervention::new(task_id(), None, None, "do x".into()).unwrap();
        let t1 = Utc::now();
        i.mark_consumed(t1);
        assert_eq!(i.consumed_at, Some(t1));
        let t2 = t1 + chrono::Duration::seconds(60);
        i.mark_consumed(t2);
        assert_eq!(i.consumed_at, Some(t1), "second stamp must not overwrite");
        assert!(!i.is_pending());
    }

    #[test]
    fn explicit_author_is_kept() {
        let i =
            LaunchTaskIntervention::new(task_id(), None, Some("alimtunc".into()), "ship it".into())
                .unwrap();
        assert_eq!(i.author, "alimtunc");
    }
}
