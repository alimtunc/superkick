use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::id::{AgentSessionId, HandoffId, RunId, StepId};
use crate::linear_context::LinearContextMode;

/// Why this session was launched. Makes lineage auditable without reading
/// terminal transcripts or inferring intent from argv.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LaunchReason {
    /// First agent for a workflow step (Plan/Code), launched by the orchestrator.
    InitialStep,
    /// Fulfils a structured handoff from the orchestrator or a parent session.
    Handoff,
    /// One of N parallel children in a review swarm fan-out.
    ReviewFanout,
    /// Launched in response to an operator escalation (SUP-76 attention reply).
    OperatorEscalation,
}

impl std::fmt::Display for LaunchReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::InitialStep => "initial_step",
            Self::Handoff => "handoff",
            Self::ReviewFanout => "review_fanout",
            Self::OperatorEscalation => "operator_escalation",
        };
        f.write_str(s)
    }
}

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
    /// MCP servers this session was actually wired with (post-degradation).
    /// Empty vec when the role's MCP policy resolved to `none` or every
    /// requested server was dropped at spawn time. Stored as a snapshot —
    /// only server names from the registry, never resolved env values.
    pub mcp_servers_used: Vec<String>,
    /// Snapshot of the role's tool allowlist at spawn time. `None` means
    /// "no allowlist" (no tool restriction was declared); `Some(vec![])`
    /// means "deny everything". Provider-side enforcement is best-effort;
    /// this column is the source of truth for what the operator authorised.
    pub tools_allow_snapshot: Option<Vec<String>>,
    /// `true` when the role required explicit operator approval per tool
    /// call. Recorded for audit even though enforcement is provider-side.
    pub tool_approval_required: bool,
    /// `true` when tool result payloads are persisted in the audit trail.
    /// Default-on; set to `false` when handling secrets.
    pub tool_results_persisted: bool,
    /// Catalog role name this session is filling (`planner`, `coder`, ...).
    /// `None` for legacy rows written before SUP-46.
    pub role: Option<String>,
    /// Short human/auditor-facing summary of what this session is for.
    pub purpose: Option<String>,
    /// Session that requested this child. `None` when launched directly by
    /// the orchestrator (no parent session).
    pub parent_session_id: Option<AgentSessionId>,
    /// Why this session was launched.
    pub launch_reason: Option<LaunchReason>,
    /// Handoff this spawn fulfils, if any.
    pub handoff_id: Option<HandoffId>,
}
