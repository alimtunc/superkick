use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::id::{AgentSessionId, RunId, StepId};
use crate::linear_context::LinearContextMode;

/// Which agent provider is being used.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentProvider {
    Claude,
    Codex,
}

impl std::fmt::Display for AgentProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Claude => f.write_str("claude"),
            Self::Codex => f.write_str("codex"),
        }
    }
}

/// Status of an agent subprocess.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Starting,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// A tracked subprocess session for an agent (claude, codex).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSession {
    pub id: AgentSessionId,
    pub run_id: RunId,
    pub run_step_id: StepId,
    pub provider: AgentProvider,
    pub command: String,
    pub pid: Option<u32>,
    pub status: AgentStatus,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
    pub exit_code: Option<i32>,
    /// How Linear context was delivered to this session. Recorded so the run
    /// log reveals whether a child agent had live MCP access or only a
    /// prompt snapshot. `None` for legacy rows written before this field
    /// existed.
    pub linear_context_mode: Option<LinearContextMode>,
}
