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
    pub tools: Option<Vec<String>>,
    pub timeout_secs: Option<u64>,
    pub max_turns: Option<u32>,
    /// How much Linear context this role receives at spawn time. Defaults to
    /// `LinearContextMode::Snapshot` — the role gets a compact prompt snapshot
    /// but no live MCP access.
    #[serde(default)]
    pub linear_context: LinearContextMode,
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
}

/// Errors the router can emit when a role cannot be launched.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum RouterError {
    #[error("agent role '{0}' is not defined in the project catalog")]
    UnknownRole(String),
    #[error("agent role '{0}' is not authorised by the current run policy")]
    NotAllowed(String),
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
            tools: None,
            timeout_secs: None,
            max_turns: None,
            linear_context: LinearContextMode::default(),
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
}
