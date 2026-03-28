use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::id::{InterruptId, RunId, StepId};

/// Status of a human interrupt.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterruptStatus {
    Pending,
    Resolved,
    Dismissed,
}

/// The action a human chooses when answering an interrupt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "action")]
pub enum InterruptAction {
    /// Retry the step that caused the blockage.
    RetryStep,
    /// Continue the run, attaching a note for context.
    ContinueWithNote { note: String },
    /// Abort the run entirely.
    AbortRun,
}

/// A point where the run is blocked and needs human input.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Interrupt {
    pub id: InterruptId,
    pub run_id: RunId,
    pub run_step_id: Option<StepId>,
    pub question: String,
    pub context_json: Option<serde_json::Value>,
    pub status: InterruptStatus,
    pub answer_json: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
}

impl Interrupt {
    pub fn new(run_id: RunId, run_step_id: Option<StepId>, question: String) -> Self {
        Self {
            id: InterruptId::new(),
            run_id,
            run_step_id,
            question,
            context_json: None,
            status: InterruptStatus::Pending,
            answer_json: None,
            created_at: Utc::now(),
            resolved_at: None,
        }
    }

    pub fn resolve(&mut self, action: &InterruptAction) {
        self.status = InterruptStatus::Resolved;
        self.answer_json = Some(serde_json::to_value(action).expect("action serialization"));
        self.resolved_at = Some(Utc::now());
    }

    pub fn dismiss(&mut self) {
        self.status = InterruptStatus::Dismissed;
        self.resolved_at = Some(Utc::now());
    }
}
