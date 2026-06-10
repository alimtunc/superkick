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
use crate::linear_context::LinearContextMode;
use crate::mcp_policy::{ResolvedMcpPolicy, ResolvedToolPolicy};
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
    /// via [`BillingProfile::default_for`] (and is force-overridden to
    /// `agent_sdk_credits` when `provider: claude` and
    /// `runner_mode: print_stream_json`).
    #[serde(default)]
    pub billing_profile: Option<BillingProfile>,
}

impl AgentDefinition {
    pub fn display_role(&self) -> &str {
        self.role.as_deref().unwrap_or(&self.name)
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
    /// Which credit pool the spawn consumes. Concrete here — defaults +
    /// the `claude + print_stream_json → agent_sdk_credits` invariant were
    /// baked in by [`RoleRouter::resolve`].
    pub billing_profile: BillingProfile,
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

        let billing_profile = BillingProfile::resolve(
            def.name.as_str(),
            def.provider,
            runner_mode,
            def.billing_profile,
        );

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
            RunnerMode::InteractivePty
        );
        assert_eq!(r.resolve("b").unwrap().runner_mode, RunnerMode::ExecJson);
    }

    #[test]
    fn resolve_forces_agent_sdk_credits_for_claude_print() {
        let mut d = def("p", AgentProvider::Claude);
        d.runner_mode = Some(RunnerMode::PrintStreamJson);
        d.billing_profile = Some(BillingProfile::Subscription); // attempted override
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
    fn resolve_defaults_billing_for_codex_interactive_is_subscription() {
        let mut d = def("c", AgentProvider::Codex);
        d.runner_mode = Some(RunnerMode::InteractivePty);
        let cat = AgentCatalog::from_definitions([d]);
        let policy = RunPolicy::allow_all();
        let r = RoleRouter::new(&cat, &policy).resolve("c").unwrap();
        assert_eq!(r.billing_profile, BillingProfile::Subscription);
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
