use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::id::{EventId, RunId, StepId};

/// Classification of a run event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    StateChange,
    StepStarted,
    StepCompleted,
    StepFailed,
    AgentOutput,
    CommandOutput,
    InterruptCreated,
    InterruptResolved,
    ReviewCompleted,
    Error,
    ExternalAttach,
    OperatorInput,
}

/// Severity level for run events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventLevel {
    Debug,
    Info,
    Warn,
    Error,
}

/// A timestamped event within a run, used for observability and the event stream.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunEvent {
    pub id: EventId,
    pub run_id: RunId,
    pub run_step_id: Option<StepId>,
    pub ts: DateTime<Utc>,
    pub kind: EventKind,
    pub level: EventLevel,
    pub message: String,
    pub payload_json: Option<serde_json::Value>,
}

impl RunEvent {
    pub fn new(
        run_id: RunId,
        run_step_id: Option<StepId>,
        kind: EventKind,
        level: EventLevel,
        message: String,
    ) -> Self {
        Self {
            id: EventId::new(),
            run_id,
            run_step_id,
            ts: Utc::now(),
            kind,
            level,
            message,
            payload_json: None,
        }
    }
}
