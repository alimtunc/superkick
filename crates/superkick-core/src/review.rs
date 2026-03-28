use serde::{Deserialize, Serialize};

use crate::id::AgentSessionId;

/// Result of a single review agent within a review swarm.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewFinding {
    pub agent_name: String,
    pub session_id: AgentSessionId,
    pub passed: bool,
    pub exit_code: Option<i32>,
}

/// Aggregated result of a review swarm step.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewSwarmResult {
    pub findings: Vec<ReviewFinding>,
    pub total_agents: usize,
    pub passed_count: usize,
    pub failed_count: usize,
    /// Whether the swarm passed the configured findings threshold gate.
    pub gate_passed: bool,
}
