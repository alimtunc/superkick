use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::id::{RunId, StepId};

/// The kind of step in a run's playbook.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StepKey {
    Prepare,
    Plan,
    Code,
    Commands,
    ReviewSwarm,
    CreatePr,
    AwaitHuman,
}

impl std::fmt::Display for StepKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Prepare => "prepare",
            Self::Plan => "plan",
            Self::Code => "code",
            Self::Commands => "commands",
            Self::ReviewSwarm => "review_swarm",
            Self::CreatePr => "create_pr",
            Self::AwaitHuman => "await_human",
        };
        f.write_str(s)
    }
}

/// Status of an individual step execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StepStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
    Skipped,
}

/// A single step within a run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunStep {
    pub id: StepId,
    pub run_id: RunId,
    pub step_key: StepKey,
    pub status: StepStatus,
    pub attempt: u32,
    pub agent_provider: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub input_json: Option<serde_json::Value>,
    pub output_json: Option<serde_json::Value>,
    pub error_message: Option<String>,
}

impl RunStep {
    pub fn new(run_id: RunId, step_key: StepKey, attempt: u32) -> Self {
        Self {
            id: StepId::new(),
            run_id,
            step_key,
            status: StepStatus::Pending,
            attempt,
            agent_provider: None,
            started_at: None,
            finished_at: None,
            input_json: None,
            output_json: None,
            error_message: None,
        }
    }
}
