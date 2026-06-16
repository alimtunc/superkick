//! Role → provider/command routing contract.
//!
//! The orchestrator never spawns an agent directly by provider. It asks the
//! router for a role (e.g. `planner`, `reviewer`) and the router returns a
//! fully-resolved launch recipe — provider, program, argv, model, prompt,
//! budget. This keeps the mapping inspectable and guarantees that only roles
//! authorised by the run policy can ever reach the PTY substrate.
//!
//! Resolution order for a given role:
//!
//! 1. The role must exist in the project agent catalog (`AgentCatalog`).
//! 2. The role must be allowed by the active `RunPolicy`.
//! 3. The router combines the catalog definition with a provider's default
//!    command to produce a `ResolvedAgent`.
//!
//! The catalog is immutable at run launch time. Per-run overrides are
//! represented by narrowing the `RunPolicy.allowed_agents` set — they never
//! extend the catalog or synthesise new roles.

use std::collections::{BTreeSet, HashMap};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::agent::AgentProvider;
use crate::error::CoreError;
use crate::linear_context::LinearContextMode;
use crate::mcp_policy::{McpMode, ResolvedMcpPolicy, ResolvedToolPolicy};
use crate::reasoning::ReasoningEffort;
use crate::runner_mode::{BillingProfile, RunnerMode, RunnerModeError};

/// Optional execution backend layered on top of the resolved provider command.
/// See `docs/conventions/rust.md` (Agents & router) for the fallback contract
/// and the Claude-only invariant.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentBackend {
    /// Default spawn path — equivalent to `backend: None`. Kept as an explicit
    /// variant so YAML can opt back into the default when a parent template
    /// provides a non-default value.
    Protocol,
    ClaudeSubagent {
        subagent_name: String,
    },
    /// Order in the list is preserved so operators can sequence skills.
    ClaudeSkill {
        skills: Vec<String>,
    },
}

impl AgentBackend {
    /// Stable string operators grep for in the audit ledger
    /// (`backend=claude_subagent(planner)`).
    pub fn audit_tag(&self) -> String {
        match self {
            Self::Protocol => "protocol".to_string(),
            Self::ClaudeSubagent { subagent_name } => {
                format!("claude_subagent({subagent_name})")
            }
            Self::ClaudeSkill { skills } => format!("claude_skill([{}])", skills.join(", ")),
        }
    }

    pub fn requires_claude(&self) -> bool {
        matches!(self, Self::ClaudeSubagent { .. } | Self::ClaudeSkill { .. })
    }
}

/// Where a catalog entry came from. `Builtin` rows are seeded by Superkick
/// and exist on every project regardless of `superkick.yaml`. `Custom` rows
/// come from the project's YAML and override a built-in of the same name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AgentOrigin {
    Builtin,
    #[default]
    Custom,
}

/// Agent identity badge — local-first, no file upload. `icon` is either a
/// single emoji or a key from the frontend SK icon set; `color` is a CSS color
/// string (hex). Stored as JSON on the agent row (`avatar_json`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentAvatar {
    pub icon: String,
    pub color: String,
}

/// One project-level agent role as consumed by the router.
///
/// This is a projection of `superkick_config::AgentDefinition` that the core
/// crate can reason about without depending on the config crate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentDefinition {
    pub name: String,
    pub provider: AgentProvider,
    pub role: Option<String>,
    pub model: Option<String>,
    pub system_prompt: Option<String>,
    pub timeout_secs: Option<u64>,
    pub max_turns: Option<u32>,
    /// Whether this entry is a Superkick-shipped default or a project-defined
    /// override. Serialised at the HTTP boundary so the picker can group
    /// built-ins and custom entries distinctly.
    #[serde(default)]
    pub origin: AgentOrigin,
    /// How much Linear context this role receives at spawn time. Defaults to
    /// `LinearContextMode::Snapshot` — the role gets a compact prompt snapshot
    /// but no live MCP access.
    #[serde(default)]
    pub linear_context: LinearContextMode,
    /// Resolved MCP policy for this role. Already desugared from the
    /// `linear_context: snapshot_plus_mcp` shortcut at catalog-build time —
    /// the router never re-applies the sugar.
    #[serde(default)]
    pub mcp_policy: ResolvedMcpPolicy,
    /// Resolved tool policy for this role. Allow/deny lists are
    /// informational; the booleans (`require_approval`, `persist_results`)
    /// drive audit columns on the agent session.
    #[serde(default)]
    pub tool_policy: ResolvedToolPolicy,
    #[serde(default)]
    pub backend: Option<AgentBackend>,
    /// How the provider CLI is spawned (`interactive_pty`,
    /// `print_stream_json`, `exec_json`). `None` desugars at resolve-time
    /// via [`RunnerMode::default_for`].
    #[serde(default)]
    pub runner_mode: Option<RunnerMode>,
    /// Which credit pool the spawn consumes. `None` desugars at resolve-time
    /// via [`BillingProfile::default_for`]; an explicit value is honored. Claude
    /// `print_stream_json` defaults to subscription-backed for now, subject to
    /// Anthropic policy changes.
    #[serde(default)]
    pub billing_profile: Option<BillingProfile>,
    /// Reasoning effort the agent seeds onto a composer step. Mirrors
    /// [`crate::SkillDefinition::default_reasoning`]; the router itself never
    /// consumes it (reasoning rides on the step, not the spawn recipe).
    #[serde(default)]
    pub default_reasoning: ReasoningEffort,
    /// Whether this agent is offered in the roster/picker. Disabled agents
    /// stay in the catalog (so a live launch referencing one still resolves)
    /// but are hidden from new compositions by the UI.
    #[serde(default = "crate::serde_util::default_true")]
    pub enabled: bool,
    /// Skill ids attached to this agent. When a composer step selects this
    /// agent as its primary unit, these skills materialise at launch and the
    /// step's `skill_ref` is ignored. Stored as a JSON array (`skills_json`).
    #[serde(default)]
    pub skills: Vec<String>,
    /// Identity badge shown in the roster, cockpit, and picker. `None` falls
    /// back to a derived initial in the UI. Stored as JSON (`avatar_json`).
    #[serde(default)]
    pub avatar: Option<AgentAvatar>,
    /// Operator-facing one-line description. Stored as `description TEXT`.
    #[serde(default)]
    pub description: Option<String>,
}

impl AgentDefinition {
    pub fn display_role(&self) -> &str {
        self.role.as_deref().unwrap_or(&self.name)
    }

    /// Validate an agent before it is persisted. Builtins are constructed
    /// internally and always pass; this guards operator-authored input.
    /// `name` is the catalog key and DB primary key, so it must be a safe
    /// slug — the same constraint [`crate::SkillDefinition`] places on `id`.
    pub fn validate(&self) -> Result<(), CoreError> {
        if self.name.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "agent name must not be empty".into(),
            ));
        }
        if !crate::slug::is_safe_slug(&self.name) {
            return Err(CoreError::InvalidInput(format!(
                "agent name `{}` is not a safe slug (expected ^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$)",
                self.name
            )));
        }
        self.runner_mode
            .unwrap_or_else(|| RunnerMode::default_for(self.provider))
            .validate_with(self.provider)
            .map_err(|RunnerModeError::Incompatible { mode, provider }| {
                CoreError::InvalidInput(format!(
                    "agent `{}` has an incompatible (provider, runner_mode) pair: {mode} on {provider}",
                    self.name
                ))
            })?;
        // Skills are soft-checked: a non-existent skill id is tolerated (it may
        // be authored later) but a malformed id is a clear authoring error.
        for skill in &self.skills {
            if !crate::slug::is_safe_slug(skill) {
                return Err(CoreError::InvalidInput(format!(
                    "agent `{}` references skill id `{skill}` which is not a safe slug",
                    self.name
                )));
            }
        }
        Ok(())
    }

    /// Builtin agents are re-seeded on factory reset and cannot be deleted
    /// (disable them instead); operator-authored custom agents can.
    pub const fn is_deletable(&self) -> bool {
        matches!(self.origin, AgentOrigin::Custom)
    }

    /// The six canonical builtin agents — Codex first, then Claude; planner →
    /// coder → reviewer within each provider. `seed_defaults` writes editable
    /// DB copies; these constants remain the source of truth for a factory
    /// reset and for a fresh install with no `superkick.yaml`.
    pub fn builtins() -> Vec<AgentDefinition> {
        vec![
            builtin_planner(CODEX_PLAN, AgentProvider::Codex),
            builtin_coder(CODEX_IMPLEMENT, AgentProvider::Codex),
            builtin_reviewer(CODEX_REVIEW, AgentProvider::Codex),
            builtin_planner(CLAUDE_PLAN, AgentProvider::Claude),
            builtin_coder(CLAUDE_IMPLEMENT, AgentProvider::Claude),
            builtin_reviewer(CLAUDE_REVIEW, AgentProvider::Claude),
        ]
    }
}

/// Registry name of the hosted Linear MCP server. The single source of truth
/// for the string both the builtin planner agents and the config-side server
/// registry key off, so the two cannot drift.
pub const LINEAR_MCP_SERVER_NAME: &str = "linear";

/// Stable builtin agent names. `<provider>-<role>` so the picker groups
/// cleanly; referenced by the Standard launch profile and seeding.
pub const CODEX_PLAN: &str = "codex-plan";
pub const CODEX_IMPLEMENT: &str = "codex-implement";
pub const CODEX_REVIEW: &str = "codex-review";
pub const CLAUDE_PLAN: &str = "claude-plan";
pub const CLAUDE_IMPLEMENT: &str = "claude-implement";
pub const CLAUDE_REVIEW: &str = "claude-review";

const ROLE_PLANNER: &str = "planner";
const ROLE_CODER: &str = "coder";
const ROLE_REVIEWER: &str = "reviewer";

/// Builtin skill ids each builtin agent attaches as its primary behaviour
/// source. These match the seeded skill_definitions ids and the Standard
/// profile's step `skill_ref`s.
const SKILL_PLAN: &str = "plan";
const SKILL_IMPLEMENT: &str = "implement";
const SKILL_REVIEW: &str = "review";

/// Builtins intentionally leave `system_prompt`/`model` unset so the provider
/// CLI default model is used and the step prompt is the single source of role
/// behaviour. The planner wires the Linear MCP so a fresh install can query
/// issues without hand-authored config.
fn builtin_planner(name: &str, provider: AgentProvider) -> AgentDefinition {
    AgentDefinition {
        name: name.into(),
        provider,
        role: Some(ROLE_PLANNER.into()),
        model: None,
        system_prompt: None,
        timeout_secs: None,
        max_turns: None,
        origin: AgentOrigin::Builtin,
        linear_context: LinearContextMode::SnapshotPlusMcp,
        mcp_policy: ResolvedMcpPolicy {
            mode: McpMode::Servers,
            servers: vec![LINEAR_MCP_SERVER_NAME.into()],
        },
        tool_policy: ResolvedToolPolicy::default(),
        backend: None,
        runner_mode: None,
        billing_profile: None,
        default_reasoning: ReasoningEffort::Medium,
        enabled: true,
        skills: vec![SKILL_PLAN.into()],
        avatar: Some(AgentAvatar {
            icon: "doc".into(),
            color: "#6366f1".into(),
        }),
        description: Some("Breaks the issue into a plan; reads Linear context over MCP.".into()),
    }
}

fn builtin_coder(name: &str, provider: AgentProvider) -> AgentDefinition {
    AgentDefinition {
        name: name.into(),
        provider,
        role: Some(ROLE_CODER.into()),
        model: None,
        system_prompt: None,
        timeout_secs: None,
        max_turns: None,
        origin: AgentOrigin::Builtin,
        linear_context: LinearContextMode::Snapshot,
        mcp_policy: ResolvedMcpPolicy::default(),
        tool_policy: ResolvedToolPolicy::default(),
        backend: None,
        runner_mode: None,
        billing_profile: None,
        default_reasoning: ReasoningEffort::Medium,
        enabled: true,
        skills: vec![SKILL_IMPLEMENT.into()],
        avatar: Some(AgentAvatar {
            icon: "terminal".into(),
            color: "#10b981".into(),
        }),
        description: Some("Implements the approved plan in the worktree.".into()),
    }
}

fn builtin_reviewer(name: &str, provider: AgentProvider) -> AgentDefinition {
    AgentDefinition {
        name: name.into(),
        provider,
        role: Some(ROLE_REVIEWER.into()),
        model: None,
        system_prompt: None,
        timeout_secs: None,
        max_turns: None,
        origin: AgentOrigin::Builtin,
        linear_context: LinearContextMode::None,
        mcp_policy: ResolvedMcpPolicy::default(),
        tool_policy: ResolvedToolPolicy {
            allow: None,
            deny: Some(vec!["bash".into(), "write".into()]),
            require_approval: false,
            persist_results: true,
        },
        backend: None,
        runner_mode: None,
        billing_profile: None,
        default_reasoning: ReasoningEffort::Medium,
        enabled: true,
        skills: vec![SKILL_REVIEW.into()],
        avatar: Some(AgentAvatar {
            icon: "search".into(),
            color: "#f59e0b".into(),
        }),
        description: Some("Reviews the diff read-only — bash and write denied.".into()),
    }
}

/// The full project agent catalog — the only source of truth for what roles
/// may ever be spawned by Superkick for a given project.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AgentCatalog {
    roles: HashMap<String, AgentDefinition>,
}

impl AgentCatalog {
    pub fn new(roles: HashMap<String, AgentDefinition>) -> Self {
        Self { roles }
    }

    pub fn from_definitions<I: IntoIterator<Item = AgentDefinition>>(iter: I) -> Self {
        Self {
            roles: iter.into_iter().map(|d| (d.name.clone(), d)).collect(),
        }
    }

    pub fn get(&self, name: &str) -> Option<&AgentDefinition> {
        self.roles.get(name)
    }

    pub fn names(&self) -> impl Iterator<Item = &str> {
        self.roles.keys().map(String::as_str)
    }

    /// Iterate every role definition in the catalog. Order is unspecified
    /// (HashMap-backed); callers that need a stable order must sort.
    pub fn definitions(&self) -> impl Iterator<Item = &AgentDefinition> {
        self.roles.values()
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.roles.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.roles.is_empty()
    }
}

/// Authorisation set attached to a specific run: which catalog roles this run
/// may spawn. `None` means "every role in the catalog is allowed" — useful
/// when no narrowing profile is applied.
///
/// A `RunPolicy` never extends the catalog. It can only restrict it.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct RunPolicy {
    #[serde(default)]
    allowed_agents: Option<BTreeSet<String>>,
}

impl RunPolicy {
    /// Allow every role currently defined in the catalog.
    pub fn allow_all() -> Self {
        Self {
            allowed_agents: None,
        }
    }

    /// Restrict the run to the given subset of role names.
    pub fn allow_only<I, S>(names: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self {
            allowed_agents: Some(names.into_iter().map(Into::into).collect()),
        }
    }

    pub fn is_allowed(&self, name: &str) -> bool {
        match &self.allowed_agents {
            None => true,
            Some(set) => set.contains(name),
        }
    }

    pub fn allowed_set(&self) -> Option<&BTreeSet<String>> {
        self.allowed_agents.as_ref()
    }

    /// Merge an optional per-run override onto a base policy. `None` means
    /// "no override" — fall back to the base policy. An explicit empty set
    /// means "nothing allowed" and is preserved as-is.
    pub fn with_override(self, override_policy: Option<RunPolicy>) -> Self {
        match override_policy {
            None => self,
            Some(p) => p,
        }
    }
}

/// A fully-resolved launch recipe — everything the runtime needs to spawn
/// one agent session without needing to re-read the catalog.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedAgent {
    pub name: String,
    pub role: String,
    pub provider: AgentProvider,
    pub model: Option<String>,
    pub system_prompt: Option<String>,
    pub program: String,
    pub args: Vec<String>,
    pub timeout: Option<Duration>,
    pub max_turns: Option<u32>,
    /// Linear context mode carried through from the catalog so the runtime
    /// can decide whether to fetch a snapshot and/or wire an MCP config.
    pub linear_context: LinearContextMode,
    /// Resolved MCP policy. The runtime joins `mcp_policy.servers` with the
    /// project registry to materialise the per-role MCP config file.
    pub mcp_policy: ResolvedMcpPolicy,
    /// Resolved tool policy snapshot. Audited as-is on the agent session.
    pub tool_policy: ResolvedToolPolicy,
    pub backend: Option<AgentBackend>,
    /// How the provider CLI is spawned. Concrete here — defaults were baked
    /// in by [`RoleRouter::resolve`].
    pub runner_mode: RunnerMode,
    /// Which credit pool the spawn consumes. Concrete here — defaults and any
    /// explicit override were baked in by [`RoleRouter::resolve`].
    pub billing_profile: BillingProfile,
}

impl ResolvedAgent {
    /// Re-point this recipe at a different runner mode — a shared agent run on
    /// a per-profile runner. Re-derives `billing_profile` through the one
    /// [`BillingProfile::resolve`] so the default/override rule is applied at
    /// this seam too, not just in [`RoleRouter::resolve`]. `billing_override`
    /// is the agent definition's explicit `billing_profile` (`None` defers to
    /// the `(provider, mode)` default).
    pub fn with_runner_mode(
        mut self,
        runner_mode: RunnerMode,
        billing_override: Option<BillingProfile>,
    ) -> Result<Self, RunnerModeError> {
        runner_mode.validate_with(self.provider)?;
        self.billing_profile =
            BillingProfile::resolve(self.provider, runner_mode, billing_override);
        self.runner_mode = runner_mode;
        Ok(self)
    }
}

/// Errors the router can emit when a role cannot be launched.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum RouterError {
    #[error("agent role '{0}' is not defined in the project catalog")]
    UnknownRole(String),
    #[error("agent role '{0}' is not authorised by the current run policy")]
    NotAllowed(String),
    #[error(
        "agent role '{role}' has an incompatible (provider, runner_mode) pair: {mode} on {provider}"
    )]
    IncompatibleRunnerMode {
        role: String,
        mode: RunnerMode,
        provider: AgentProvider,
    },
}

/// Router bound to a specific catalog + run policy. Build one per run and
/// route every spawn through it — this is how we keep the allowed set
/// enforceable end-to-end.
#[derive(Debug, Clone, Copy)]
pub struct RoleRouter<'a> {
    catalog: &'a AgentCatalog,
    policy: &'a RunPolicy,
}

impl<'a> RoleRouter<'a> {
    pub fn new(catalog: &'a AgentCatalog, policy: &'a RunPolicy) -> Self {
        Self { catalog, policy }
    }

    pub fn policy(&self) -> &RunPolicy {
        self.policy
    }

    /// Resolve a role name into a concrete launch recipe.
    ///
    /// Fails if the role is not in the catalog or not allowed by the policy.
    pub fn resolve(&self, role_name: &str) -> Result<ResolvedAgent, RouterError> {
        let def = self
            .catalog
            .get(role_name)
            .ok_or_else(|| RouterError::UnknownRole(role_name.to_string()))?;

        if !self.policy.is_allowed(role_name) {
            return Err(RouterError::NotAllowed(role_name.to_string()));
        }

        let runner_mode = def
            .runner_mode
            .unwrap_or_else(|| RunnerMode::default_for(def.provider));
        runner_mode.validate_with(def.provider).map_err(
            |RunnerModeError::Incompatible { mode, provider }| {
                RouterError::IncompatibleRunnerMode {
                    role: def.name.clone(),
                    mode,
                    provider,
                }
            },
        )?;

        let billing_profile =
            BillingProfile::resolve(def.provider, runner_mode, def.billing_profile);

        let (program, args) = provider_command(def.provider);
        Ok(ResolvedAgent {
            name: def.name.clone(),
            role: def.display_role().to_string(),
            provider: def.provider,
            model: def.model.clone(),
            system_prompt: def.system_prompt.clone(),
            program: program.to_string(),
            args: args.into_iter().map(String::from).collect(),
            timeout: def.timeout_secs.map(Duration::from_secs),
            max_turns: def.max_turns,
            linear_context: def.linear_context,
            mcp_policy: def.mcp_policy.clone(),
            tool_policy: def.tool_policy.clone(),
            backend: def.backend.clone(),
            runner_mode,
            billing_profile,
        })
    }
}

/// Default provider CLI invocation — previously lived in runtime, lifted into
/// core so routing is inspectable from one place.
fn provider_command(provider: AgentProvider) -> (&'static str, Vec<&'static str>) {
    match provider {
        AgentProvider::Claude => ("claude", vec!["--dangerously-skip-permissions"]),
        AgentProvider::Codex => ("codex", vec![]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn def(name: &str, provider: AgentProvider) -> AgentDefinition {
        AgentDefinition {
            name: name.to_string(),
            provider,
            role: None,
            model: None,
            system_prompt: None,
            timeout_secs: None,
            max_turns: None,
            origin: AgentOrigin::default(),
            linear_context: LinearContextMode::default(),
            mcp_policy: ResolvedMcpPolicy::default(),
            tool_policy: ResolvedToolPolicy::default(),
            backend: None,
            runner_mode: None,
            billing_profile: None,
            default_reasoning: ReasoningEffort::default(),
            enabled: true,
            skills: Vec::new(),
            avatar: None,
            description: None,
        }
    }

    fn catalog() -> AgentCatalog {
        AgentCatalog::from_definitions([
            def("planner", AgentProvider::Claude),
            def("coder", AgentProvider::Claude),
            def("reviewer", AgentProvider::Codex),
        ])
    }

    #[test]
    fn resolves_known_role_with_allow_all() {
        let cat = catalog();
        let policy = RunPolicy::allow_all();
        let router = RoleRouter::new(&cat, &policy);
        let resolved = router.resolve("planner").unwrap();
        assert_eq!(resolved.name, "planner");
        assert_eq!(resolved.provider, AgentProvider::Claude);
        assert_eq!(resolved.program, "claude");
    }

    #[test]
    fn rejects_unknown_role() {
        let cat = catalog();
        let policy = RunPolicy::allow_all();
        let router = RoleRouter::new(&cat, &policy);
        assert_eq!(
            router.resolve("ghost").unwrap_err(),
            RouterError::UnknownRole("ghost".into())
        );
    }

    #[test]
    fn rejects_role_outside_policy() {
        let cat = catalog();
        let policy = RunPolicy::allow_only(["planner"]);
        let router = RoleRouter::new(&cat, &policy);
        assert_eq!(
            router.resolve("reviewer").unwrap_err(),
            RouterError::NotAllowed("reviewer".into())
        );
    }

    #[test]
    fn empty_allow_set_denies_everything() {
        let cat = catalog();
        let policy = RunPolicy::allow_only::<_, String>(Vec::new());
        let router = RoleRouter::new(&cat, &policy);
        assert!(matches!(
            router.resolve("planner"),
            Err(RouterError::NotAllowed(_))
        ));
    }

    #[test]
    fn run_policy_override_replaces_base() {
        let base = RunPolicy::allow_only(["planner", "coder"]);
        let merged = base.with_override(Some(RunPolicy::allow_only(["planner"])));
        assert!(merged.is_allowed("planner"));
        assert!(!merged.is_allowed("coder"));
    }

    #[test]
    fn run_policy_none_override_preserves_base() {
        let base = RunPolicy::allow_only(["planner"]);
        let merged = base.with_override(None);
        assert!(merged.is_allowed("planner"));
        assert!(!merged.is_allowed("coder"));
    }

    #[test]
    fn resolve_carries_backend_through_to_resolved_agent() {
        let mut planner = def("planner", AgentProvider::Claude);
        planner.backend = Some(AgentBackend::ClaudeSubagent {
            subagent_name: "general-purpose".into(),
        });
        let cat = AgentCatalog::from_definitions([planner]);
        let policy = RunPolicy::allow_all();
        let router = RoleRouter::new(&cat, &policy);
        let resolved = router.resolve("planner").unwrap();
        assert_eq!(
            resolved.backend,
            Some(AgentBackend::ClaudeSubagent {
                subagent_name: "general-purpose".into()
            })
        );
    }

    #[test]
    fn protocol_backend_and_none_backend_resolve_identically() {
        let mut with_protocol = def("a", AgentProvider::Claude);
        with_protocol.backend = Some(AgentBackend::Protocol);
        let cat_proto = AgentCatalog::from_definitions([with_protocol]);

        let without = def("a", AgentProvider::Claude);
        let cat_none = AgentCatalog::from_definitions([without]);

        let policy = RunPolicy::allow_all();
        let resolved_proto = RoleRouter::new(&cat_proto, &policy).resolve("a").unwrap();
        let resolved_none = RoleRouter::new(&cat_none, &policy).resolve("a").unwrap();

        assert_eq!(resolved_proto.program, resolved_none.program);
        assert_eq!(resolved_proto.args, resolved_none.args);
        assert_eq!(resolved_proto.provider, resolved_none.provider);
        assert_eq!(resolved_proto.backend, Some(AgentBackend::Protocol));
        assert_eq!(resolved_none.backend, None);
    }

    #[test]
    fn backend_requires_claude_predicate_is_correct() {
        assert!(!AgentBackend::Protocol.requires_claude());
        assert!(
            AgentBackend::ClaudeSubagent {
                subagent_name: "x".into()
            }
            .requires_claude()
        );
        assert!(
            AgentBackend::ClaudeSkill {
                skills: vec!["foo".into()]
            }
            .requires_claude()
        );
    }

    #[test]
    fn resolve_carries_runner_mode_through() {
        let mut d = def("planner", AgentProvider::Claude);
        d.runner_mode = Some(RunnerMode::PrintStreamJson);
        let cat = AgentCatalog::from_definitions([d]);
        let policy = RunPolicy::allow_all();
        let resolved = RoleRouter::new(&cat, &policy).resolve("planner").unwrap();
        assert_eq!(resolved.runner_mode, RunnerMode::PrintStreamJson);
    }

    #[test]
    fn resolve_defaults_runner_mode_per_provider() {
        let cat = AgentCatalog::from_definitions([
            def("a", AgentProvider::Claude),
            def("b", AgentProvider::Codex),
        ]);
        let policy = RunPolicy::allow_all();
        let r = RoleRouter::new(&cat, &policy);
        assert_eq!(
            r.resolve("a").unwrap().runner_mode,
            RunnerMode::PrintStreamJson
        );
        assert_eq!(r.resolve("b").unwrap().runner_mode, RunnerMode::ExecJson);
    }

    #[test]
    fn resolve_claude_print_defaults_to_subscription() {
        let mut d = def("p", AgentProvider::Claude);
        d.runner_mode = Some(RunnerMode::PrintStreamJson);
        let cat = AgentCatalog::from_definitions([d]);
        let policy = RunPolicy::allow_all();
        let resolved = RoleRouter::new(&cat, &policy).resolve("p").unwrap();
        assert_eq!(resolved.billing_profile, BillingProfile::Subscription);
    }

    #[test]
    fn resolve_honors_explicit_billing_override_on_claude_print() {
        let mut d = def("p", AgentProvider::Claude);
        d.runner_mode = Some(RunnerMode::PrintStreamJson);
        d.billing_profile = Some(BillingProfile::AgentSdkCredits); // explicit override, now honored
        let cat = AgentCatalog::from_definitions([d]);
        let policy = RunPolicy::allow_all();
        let resolved = RoleRouter::new(&cat, &policy).resolve("p").unwrap();
        assert_eq!(resolved.billing_profile, BillingProfile::AgentSdkCredits);
    }

    #[test]
    fn resolve_rejects_incompatible_provider_mode_pair() {
        let mut d = def("ghost", AgentProvider::Claude);
        d.runner_mode = Some(RunnerMode::ExecJson);
        let cat = AgentCatalog::from_definitions([d]);
        let policy = RunPolicy::allow_all();
        let err = RoleRouter::new(&cat, &policy).resolve("ghost").unwrap_err();
        assert!(matches!(
            err,
            RouterError::IncompatibleRunnerMode {
                provider: AgentProvider::Claude,
                mode: RunnerMode::ExecJson,
                ..
            }
        ));
    }

    #[test]
    fn with_runner_mode_rederives_billing_and_honors_override() {
        let cat = AgentCatalog::from_definitions([def("planner", AgentProvider::Claude)]);
        let policy = RunPolicy::allow_all();
        // Default Claude now resolves to print_stream_json + subscription.
        let resolved = RoleRouter::new(&cat, &policy).resolve("planner").unwrap();
        assert_eq!(resolved.runner_mode, RunnerMode::PrintStreamJson);
        assert_eq!(resolved.billing_profile, BillingProfile::Subscription);
        // Re-pointing it at interactive_pty re-derives billing; an explicit
        // override is honored at this seam.
        let repointed = resolved
            .with_runner_mode(
                RunnerMode::InteractivePty,
                Some(BillingProfile::AgentSdkCredits),
            )
            .unwrap();
        assert_eq!(repointed.runner_mode, RunnerMode::InteractivePty);
        assert_eq!(repointed.billing_profile, BillingProfile::AgentSdkCredits);
    }

    #[test]
    fn with_runner_mode_rejects_incompatible_pair() {
        let cat = AgentCatalog::from_definitions([def("planner", AgentProvider::Claude)]);
        let policy = RunPolicy::allow_all();
        let resolved = RoleRouter::new(&cat, &policy).resolve("planner").unwrap();
        // exec_json is a Codex-only mode — incompatible with a Claude recipe.
        assert!(matches!(
            resolved.with_runner_mode(RunnerMode::ExecJson, None),
            Err(RunnerModeError::Incompatible {
                provider: AgentProvider::Claude,
                mode: RunnerMode::ExecJson,
            })
        ));
    }

    #[test]
    fn resolve_defaults_billing_for_codex_interactive_is_subscription() {
        let mut d = def("c", AgentProvider::Codex);
        d.runner_mode = Some(RunnerMode::InteractivePty);
        let cat = AgentCatalog::from_definitions([d]);
        let policy = RunPolicy::allow_all();
        let r = RoleRouter::new(&cat, &policy).resolve("c").unwrap();
        assert_eq!(r.billing_profile, BillingProfile::Subscription);
    }

    #[test]
    fn builtins_are_six_codex_first_then_claude_and_validate() {
        let builtins = AgentDefinition::builtins();
        let names: Vec<_> = builtins.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(
            names,
            [
                CODEX_PLAN,
                CODEX_IMPLEMENT,
                CODEX_REVIEW,
                CLAUDE_PLAN,
                CLAUDE_IMPLEMENT,
                CLAUDE_REVIEW
            ]
        );
        assert!(builtins.iter().all(|a| a.origin == AgentOrigin::Builtin));
        assert!(builtins.iter().all(|a| a.validate().is_ok()));
        assert!(builtins.iter().all(|a| !a.is_deletable()));
    }

    #[test]
    fn planner_builtin_wires_linear_mcp() {
        let planner = AgentDefinition::builtins()
            .into_iter()
            .find(|a| a.name == CODEX_PLAN)
            .expect("codex planner present");
        assert_eq!(planner.mcp_policy.mode, McpMode::Servers);
        assert!(
            planner
                .mcp_policy
                .servers
                .iter()
                .any(|s| s == LINEAR_MCP_SERVER_NAME)
        );
    }

    #[test]
    fn validate_rejects_unsafe_agent_names_and_custom_is_deletable() {
        let mut a = builtin_coder("ok-name", AgentProvider::Codex);
        a.origin = AgentOrigin::Custom;
        assert!(a.validate().is_ok());
        assert!(a.is_deletable());
        for bad in ["Bad", "a/b", "..", "-x", "x-", " sp ace"] {
            a.name = bad.into();
            assert!(a.validate().is_err(), "expected `{bad}` rejected");
        }
    }

    #[test]
    fn validate_rejects_incompatible_runner_mode() {
        let mut a = builtin_coder("ghost", AgentProvider::Claude);
        a.origin = AgentOrigin::Custom;
        a.runner_mode = Some(RunnerMode::ExecJson);
        assert!(a.validate().is_err());
    }

    #[test]
    fn audit_tag_renders_each_variant_distinctly() {
        assert_eq!(AgentBackend::Protocol.audit_tag(), "protocol");
        assert_eq!(
            AgentBackend::ClaudeSubagent {
                subagent_name: "planner".into()
            }
            .audit_tag(),
            "claude_subagent(planner)"
        );
        assert_eq!(
            AgentBackend::ClaudeSkill {
                skills: vec!["ticket-plan".into(), "review".into()]
            }
            .audit_tag(),
            "claude_skill([ticket-plan, review])"
        );
    }
}
