use serde::{Deserialize, Serialize};
use superkick_core::AgentProvider;

// ── Root ────────────────────────────────────────────────────────────

/// Top-level Superkick project configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuperkickConfig {
    pub version: u32,
    pub issue_source: IssueSourceConfig,
    pub runner: RunnerConfig,
    pub agents: std::collections::HashMap<String, AgentConfig>,
    pub workflow: WorkflowConfig,
    #[serde(default)]
    pub interrupts: InterruptsConfig,
    #[serde(default)]
    pub budget: BudgetConfig,
    #[serde(default)]
    pub launch_profile: LaunchProfileConfig,
}

// ── Issue source ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IssueSourceConfig {
    pub provider: IssueProvider,
    pub trigger: IssueTrigger,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueProvider {
    Linear,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueTrigger {
    InProgress,
}

// ── Runner ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunnerConfig {
    pub mode: RunnerMode,
    #[serde(default = "default_repo_root")]
    pub repo_root: String,
    #[serde(default = "default_base_branch")]
    pub base_branch: String,
    #[serde(default = "default_worktree_prefix")]
    pub worktree_prefix: String,
    /// Commands to run right after worktree creation (e.g. `pnpm install`).
    /// These run during the Prepare step, before any agent starts.
    #[serde(default)]
    pub setup_commands: Vec<String>,
}

fn default_repo_root() -> String {
    ".".into()
}
fn default_base_branch() -> String {
    "main".into()
}
fn default_worktree_prefix() -> String {
    "superkick".into()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunnerMode {
    Local,
}

// ── Agents ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub provider: AgentProvider,
}

// ── Workflow ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowConfig {
    pub steps: Vec<WorkflowStep>,
}

/// A single step in the workflow pipeline.
///
/// The `type` field selects the step kind; additional fields are required
/// depending on that kind (e.g. `agent` for plan/code, `run` for commands).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkflowStep {
    Plan {
        agent: String,
    },
    Code {
        agent: String,
    },
    Commands {
        run: Vec<String>,
    },
    ReviewSwarm {
        agents: Vec<String>,
        /// Number of agent failures required to trigger the review gate.
        /// Defaults to 1 (any failure blocks).
        #[serde(default = "default_findings_threshold")]
        findings_threshold: u32,
    },
    Pr {
        #[serde(default = "bool_true")]
        create: bool,
        #[serde(default)]
        generate_description: bool,
    },
}

fn bool_true() -> bool {
    true
}

fn default_findings_threshold() -> u32 {
    1
}

// ── Interrupts ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterruptsConfig {
    #[serde(default = "default_interrupt_policy")]
    pub on_blocked: InterruptPolicy,
    #[serde(default = "default_interrupt_policy")]
    pub on_review_conflict: InterruptPolicy,
}

impl Default for InterruptsConfig {
    fn default() -> Self {
        Self {
            on_blocked: InterruptPolicy::AskHuman,
            on_review_conflict: InterruptPolicy::AskHuman,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterruptPolicy {
    AskHuman,
    Abort,
}

fn default_interrupt_policy() -> InterruptPolicy {
    InterruptPolicy::AskHuman
}

// ── Budget ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BudgetConfig {
    #[serde(default = "default_max_retries")]
    pub max_retries_per_step: u32,
    #[serde(default = "default_max_parallel")]
    pub max_parallel_agents: u32,
    #[serde(default = "default_token_budget")]
    pub token_budget: TokenBudget,
}

impl Default for BudgetConfig {
    fn default() -> Self {
        Self {
            max_retries_per_step: default_max_retries(),
            max_parallel_agents: default_max_parallel(),
            token_budget: default_token_budget(),
        }
    }
}

fn default_max_retries() -> u32 {
    2
}
fn default_max_parallel() -> u32 {
    3
}
fn default_token_budget() -> TokenBudget {
    TokenBudget::Medium
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TokenBudget {
    Low,
    Medium,
    High,
}

// ── Launch profile ─────────────────────────────────────────────────

/// Default operator instructions injected into every run launched from the UI.
/// Individual runs can override or supplement these at launch time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchProfileConfig {
    #[serde(default = "bool_true")]
    pub use_worktree: bool,
    #[serde(default)]
    pub live_mode: bool,
    #[serde(default)]
    pub skills: Vec<String>,
    #[serde(default)]
    pub default_instructions: String,
    #[serde(default)]
    pub handoff_instructions: String,
}

impl Default for LaunchProfileConfig {
    fn default() -> Self {
        Self {
            use_worktree: true,
            live_mode: false,
            skills: Vec::new(),
            default_instructions: String::new(),
            handoff_instructions: String::new(),
        }
    }
}
