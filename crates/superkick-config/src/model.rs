use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use superkick_core::{
    AgentCatalog, AgentProvider, CoreAgentDefinition as CoreAgent, LinearContextMode, McpMode,
    RecoveryConfig, ResolvedMcpPolicy, ResolvedToolPolicy, RunBudget, RunPolicy, RunState, StepKey,
};

/// Canonical name used by the legacy `linear_context: snapshot_plus_mcp`
/// sugar when desugaring into the MCP registry. Public so the runtime can
/// match it against the auto-injected registry entry without re-hardcoding
/// the literal in two places.
pub const LINEAR_MCP_SERVER_NAME: &str = "linear";

/// URL of the hosted Linear MCP server. Auto-injected into the registry
/// when any agent uses the legacy `snapshot_plus_mcp` sugar without an
/// explicit registry entry.
pub const LINEAR_MCP_URL: &str = "https://mcp.linear.app/mcp";

// ── Root ────────────────────────────────────────────────────────────

/// Top-level Superkick project configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuperkickConfig {
    pub version: u32,
    pub issue_source: IssueSourceConfig,
    pub runner: RunnerConfig,
    pub agents: std::collections::HashMap<String, AgentDefinition>,
    pub workflow: WorkflowConfig,
    #[serde(default)]
    pub interrupts: InterruptsConfig,
    #[serde(default)]
    pub budget: BudgetConfig,
    #[serde(default)]
    pub launch_profile: LaunchProfileConfig,
    #[serde(default)]
    pub orchestration: OrchestrationConfig,
    #[serde(default)]
    pub recovery: RecoverySettings,
    /// Project-level registry of MCP servers a role may opt into. Empty by
    /// default; agents that need MCP access reference these by name through
    /// their per-role `mcp.servers` allowlist. The legacy
    /// `linear_context: snapshot_plus_mcp` sugar implicitly registers a
    /// `linear` entry pointing at the hosted Linear MCP — see
    /// [`SuperkickConfig::effective_mcp_servers`].
    #[serde(default)]
    pub mcp_servers: HashMap<String, McpServerSpec>,
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

impl IssueTrigger {
    /// Linear workflow `state.type` this trigger promotes from "tracked" to
    /// "triggerable". Threaded into the launch-queue classifier so the core
    /// crate stays unaware of the config-level enum but the coupling is
    /// compile-checked at the edge rather than via a string constant.
    #[must_use]
    pub const fn state_type(self) -> &'static str {
        match self {
            Self::InProgress => "started",
        }
    }
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

/// Project-level reusable agent role (the "catalog" entry).
///
/// Each entry in `agents:` declares a role the project is willing to spawn,
/// together with the provider/model/prompt/budget that defines its behaviour.
/// The orchestrator resolves a role through the `role -> ResolvedAgent`
/// router at launch time; it never invents roles on the fly.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDefinition {
    pub provider: AgentProvider,
    /// Optional human-readable role label (e.g. `planner`, `reviewer`).
    /// Defaults to the catalog key when absent.
    #[serde(default)]
    pub role: Option<String>,
    /// Provider model id (e.g. `claude-opus-4-6`). Passed through to the
    /// provider CLI when the router builds the command.
    #[serde(default)]
    pub model: Option<String>,
    /// Additional system prompt injected before the base step prompt.
    #[serde(default)]
    pub system_prompt: Option<String>,
    /// Informational tool allowlist. Not enforced yet — kept so it can be
    /// forwarded to providers that accept a tool restriction flag.
    #[serde(default)]
    pub tools: Option<Vec<String>>,
    /// Per-role budget overrides.
    #[serde(default)]
    pub budget: AgentBudget,
    /// How Linear issue context is delivered to this role at spawn time.
    /// Defaults to `snapshot` — a compact, read-only prompt injection with no
    /// live MCP access. Set to `snapshot_plus_mcp` to additionally wire a
    /// strict, role-scoped MCP config; set to `none` to skip Linear context
    /// entirely.
    #[serde(default)]
    pub linear_context: LinearContextMode,
    /// Per-role MCP policy (registry allowlist + mode). Defaults to no MCP
    /// access. The legacy `linear_context: snapshot_plus_mcp` sugar
    /// desugars at catalog-build time into `mcp.mode = servers` plus an
    /// implicit `linear` entry in the allowlist — operators do not have
    /// to repeat themselves.
    #[serde(default)]
    pub mcp: Option<AgentMcpPolicy>,
    /// Per-role tool policy (allow/deny lists + audit booleans). When
    /// absent the role inherits the project default: no allowlist, no
    /// require-approval, results persisted.
    #[serde(default, rename = "tool_policy")]
    pub tool_policy: Option<AgentToolPolicy>,
}

// ── MCP policy ──────────────────────────────────────────────────────

/// One entry in the project's `mcp_servers` registry.
///
/// Two transports are modelled. HTTP is what the hosted Linear MCP uses.
/// Stdio covers the long tail of locally-launched MCP processes (filesystem
/// servers, language-specific bridges, ...). Both can declare an
/// `env_passthrough` list of environment variable **names** — the names
/// are persisted, the resolved values are not. The runtime resolves them
/// at file-write time so the child process can authenticate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum McpServerSpec {
    /// Remote HTTP MCP server. Auth typically rides on the URL or
    /// upstream OAuth — `env_passthrough` is provided for symmetry but
    /// rarely needed.
    Http {
        url: String,
        #[serde(default)]
        env_passthrough: Vec<String>,
    },
    /// Local stdio MCP server. The child process inherits the listed
    /// environment variables from the supervisor; their values are
    /// resolved at write time and never persisted in the audit row.
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        env_passthrough: Vec<String>,
    },
}

/// YAML-facing per-agent MCP policy block.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentMcpPolicy {
    /// `none` (default) writes no MCP config and appends no flag.
    /// `servers` enables wiring against the named registry entries.
    #[serde(default)]
    pub mode: McpMode,
    /// Whitelist of registry entry names this role may use. Names not
    /// found in the registry are dropped at spawn time with a warning.
    #[serde(default)]
    pub servers: Vec<String>,
}

/// YAML-facing per-agent tool policy block.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentToolPolicy {
    /// Tool allowlist. Omit (or set to `null`) for "no restriction".
    /// An explicit empty list means "deny everything".
    #[serde(default)]
    pub allow: Option<Vec<String>>,
    /// Tool denylist. Combined with `allow` when both are set.
    #[serde(default)]
    pub deny: Option<Vec<String>>,
    /// `true` ⇒ provider must ask the operator before each tool call.
    #[serde(default)]
    pub require_approval: bool,
    /// `false` ⇒ tool result payloads are not stored on the audit row
    /// (use for roles handling secrets). Default-on.
    #[serde(default = "bool_true")]
    pub persist_results: bool,
}

impl Default for AgentToolPolicy {
    fn default() -> Self {
        Self {
            allow: None,
            deny: None,
            require_approval: false,
            persist_results: true,
        }
    }
}

/// Budget overrides applied per role. Missing fields inherit project defaults.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentBudget {
    /// Hard timeout in seconds for a single session. When absent the
    /// runtime's `DEFAULT_AGENT_TIMEOUT` is used.
    #[serde(default)]
    pub timeout_secs: Option<u64>,
    /// Maximum number of agent turns (provider-dependent; informational).
    #[serde(default)]
    pub max_turns: Option<u32>,
}

/// Backwards-compatible alias — older call sites refer to `AgentConfig`.
pub type AgentConfig = AgentDefinition;

impl SuperkickConfig {
    /// Build the immutable `AgentCatalog` consumed by the core `RoleRouter`.
    ///
    /// The catalog is the *project-level* source of truth: only roles in this
    /// catalog can ever be spawned, regardless of what the launch profile or
    /// a per-run override requests.
    ///
    /// The legacy `linear_context: snapshot_plus_mcp` shortcut is desugared
    /// here so the core router never has to know about it: a role using the
    /// shortcut gets `mcp.mode = servers` plus an implicit `linear` entry
    /// in the allowlist if it didn't list one explicitly.
    pub fn agent_catalog(&self) -> AgentCatalog {
        AgentCatalog::from_definitions(self.agents.iter().map(|(name, def)| CoreAgent {
            name: name.clone(),
            provider: def.provider,
            role: def.role.clone(),
            model: def.model.clone(),
            system_prompt: def.system_prompt.clone(),
            tools: def.tools.clone(),
            timeout_secs: def.budget.timeout_secs,
            max_turns: def.budget.max_turns,
            linear_context: def.linear_context,
            mcp_policy: resolve_mcp_policy(def),
            tool_policy: resolve_tool_policy(def),
        }))
    }

    /// Materialised MCP server registry, including the auto-injected
    /// `linear` entry when any agent uses the legacy
    /// `linear_context: snapshot_plus_mcp` shortcut without naming an
    /// explicit registry entry. The runtime calls this once per spawn so
    /// the desugaring rule lives in one place.
    pub fn effective_mcp_servers(&self) -> HashMap<String, McpServerSpec> {
        let mut servers = self.mcp_servers.clone();
        let needs_linear = self
            .agents
            .values()
            .any(|a| a.linear_context == LinearContextMode::SnapshotPlusMcp);
        if needs_linear {
            servers
                .entry(LINEAR_MCP_SERVER_NAME.to_string())
                .or_insert_with(|| McpServerSpec::Http {
                    url: LINEAR_MCP_URL.to_string(),
                    env_passthrough: Vec::new(),
                });
        }
        servers
    }

    /// Build the `RunPolicy` implied by the project's launch profile.
    ///
    /// A per-run override can narrow this further at launch time via
    /// `RunPolicy::with_override`.
    pub fn base_run_policy(&self) -> RunPolicy {
        match &self.launch_profile.allowed_agents {
            Some(list) => RunPolicy::allow_only(list.iter().cloned()),
            None => RunPolicy::allow_all(),
        }
    }
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
    /// Hard wall-clock ceiling in minutes. When set, the supervisor pauses
    /// the run for operator review once the elapsed time exceeds the value.
    /// Omit to disable the tripwire.
    #[serde(default)]
    pub duration_mins_per_run: Option<u64>,
    /// Cumulative retry ceiling across every step of a run. Orthogonal to
    /// `max_retries_per_step` which caps per-step attempts. Omit to disable.
    #[serde(default)]
    pub retries_max_per_run: Option<u32>,
    /// Aggregate token ceiling across every agent session. Skipped when no
    /// integration reports token usage for the run.
    #[serde(default)]
    pub token_ceiling: Option<u64>,
}

impl Default for BudgetConfig {
    fn default() -> Self {
        Self {
            max_retries_per_step: default_max_retries(),
            max_parallel_agents: default_max_parallel(),
            token_budget: default_token_budget(),
            duration_mins_per_run: None,
            retries_max_per_run: None,
            token_ceiling: None,
        }
    }
}

impl BudgetConfig {
    /// Snapshot the run-level dimensions of this config into a `RunBudget`
    /// that gets persisted on the `Run`. The minute-based config is converted
    /// to the second-based domain type so the supervisor's tripwire math
    /// stays in a single unit.
    #[must_use]
    pub fn run_budget_snapshot(&self) -> RunBudget {
        RunBudget {
            duration_secs: self.duration_mins_per_run.map(|m| m.saturating_mul(60)),
            retries_max: self.retries_max_per_run,
            token_ceiling: self.token_ceiling,
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
    /// Subset of the project agent catalog this launch profile authorises a
    /// run to spawn. `None` means "every role in the catalog is allowed".
    /// The orchestrator refuses to spawn any role outside this set.
    #[serde(default)]
    pub allowed_agents: Option<Vec<String>>,
}

// ── Orchestration (SUP-80) ──────────────────────────────────────────
//
// Caps that gate when a Linear issue is allowed to transition from
// "triggerable" to "launchable" in the launch queue. Purely declarative —
// classification is a pure function of (issues, runs, config); no background
// scheduler reads these values.

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationConfig {
    /// Maximum concurrent non-terminal runs (Queued + every in-flight state).
    /// Issues that would otherwise be `launchable` fall into `waiting-capacity`
    /// once this cap is hit. Default 3 matches the historical `max_parallel_agents`
    /// value from `budget:` so existing configs behave the same by default.
    #[serde(default = "default_max_concurrent_active_runs")]
    pub max_concurrent_active_runs: u32,
    #[serde(default)]
    pub approval_required_for: ApprovalRulesConfig,
    /// Step keys that require an explicit operator approval before the
    /// supervisor will enter them. The supervisor creates an
    /// `AttentionRequest` of kind `approval` and pauses until the operator
    /// replies. Empty by default — operators opt in per deployment.
    #[serde(default)]
    pub approval_checkpoints: Vec<StepKey>,
}

impl Default for OrchestrationConfig {
    fn default() -> Self {
        Self {
            max_concurrent_active_runs: default_max_concurrent_active_runs(),
            approval_required_for: ApprovalRulesConfig::default(),
            approval_checkpoints: Vec::new(),
        }
    }
}

fn default_max_concurrent_active_runs() -> u32 {
    3
}

/// Rules that force an issue into the `waiting-approval` bucket even when
/// everything else is green. Operator can still dispatch manually from the UI.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ApprovalRulesConfig {
    /// Linear `IssuePriority.value` values that require manual approval.
    /// Linear priorities: 0 = None, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low.
    #[serde(default)]
    pub priorities: Vec<u8>,
}

// ── Recovery scheduler (SUP-73) ─────────────────────────────────────
//
// Heartbeat-driven recovery. The defaults live in
// [`superkick_core::RecoveryConfig`] so they stay in one place; this section
// only exposes operator-tunable knobs. Empty / unset fields fall through to
// the core defaults — that's why each field is `Option`.

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RecoverySettings {
    /// How often the scheduler ticks. Defaults to
    /// [`superkick_core::RecoveryConfig::DEFAULT_TICK_INTERVAL`] (30s).
    #[serde(default)]
    pub tick_interval_secs: Option<u64>,
    /// Per-`RunState` staleness ceiling (seconds). Keys must match the
    /// `RunState` snake_case serde name (`waiting_human`, `coding`, ...).
    /// Unset states fall back to
    /// [`superkick_core::RecoveryConfig::default_thresholds`].
    #[serde(default)]
    pub thresholds_secs: HashMap<RunState, u64>,
}

impl RecoverySettings {
    /// Materialise a [`RecoveryConfig`] from this section, applying the core
    /// defaults for anything left unset.
    #[must_use]
    pub fn to_recovery_config(&self) -> RecoveryConfig {
        let mut cfg = RecoveryConfig::default();
        if let Some(tick) = self.tick_interval_secs {
            cfg.tick_interval = Duration::from_secs(tick);
        }
        for (state, secs) in &self.thresholds_secs {
            cfg.thresholds.insert(*state, Duration::from_secs(*secs));
        }
        cfg
    }
}

impl Default for LaunchProfileConfig {
    fn default() -> Self {
        Self {
            use_worktree: true,
            live_mode: false,
            skills: Vec::new(),
            default_instructions: String::new(),
            handoff_instructions: String::new(),
            allowed_agents: None,
        }
    }
}

// ── MCP / tool policy resolution helpers ────────────────────────────

/// Project-level → core-level translation of an agent's MCP block.
///
/// The legacy `linear_context: snapshot_plus_mcp` shortcut is folded in
/// here: a role using it gets `mcp.mode = servers` plus an implicit
/// `linear` entry in the allowlist if it didn't already list one. This is
/// the only place that fold lives.
fn resolve_mcp_policy(def: &AgentDefinition) -> ResolvedMcpPolicy {
    let mut policy = match &def.mcp {
        Some(p) => ResolvedMcpPolicy {
            mode: p.mode,
            servers: p.servers.clone(),
        },
        None => ResolvedMcpPolicy::default(),
    };
    if def.linear_context == LinearContextMode::SnapshotPlusMcp {
        policy.mode = McpMode::Servers;
        if !policy.servers.iter().any(|s| s == LINEAR_MCP_SERVER_NAME) {
            policy.servers.push(LINEAR_MCP_SERVER_NAME.to_string());
        }
    }
    policy
}

/// Resolves the per-role tool policy, with the legacy informational
/// `tools:` field as a fallback for `tool_policy.allow`. This keeps
/// configs that pre-date SUP-104 working: a role that listed
/// `tools: [read, grep]` for documentation now gets the same list as
/// its allowlist snapshot. An explicit `tool_policy.allow` always wins.
fn resolve_tool_policy(def: &AgentDefinition) -> ResolvedToolPolicy {
    match &def.tool_policy {
        Some(p) => ResolvedToolPolicy {
            allow: p.allow.clone().or_else(|| def.tools.clone()),
            deny: p.deny.clone(),
            require_approval: p.require_approval,
            persist_results: p.persist_results,
        },
        None => ResolvedToolPolicy {
            allow: def.tools.clone(),
            deny: None,
            require_approval: false,
            persist_results: true,
        },
    }
}
