//! Launch profiles — editable, ordered step lists.
//!
//! A `LaunchProfile` is a named, reorderable sequence of [`ProfileStep`]s the
//! operator builds in the Launch Composer by picking configured agents in
//! order. The only builtin is the empty `Custom` container
//! ([`LaunchProfile::builtins`]); the runtime seeds an editable DB copy. The
//! product no longer ships opinionated Plan/Implement/Review profiles — the
//! composer is a blank ordered list of agent steps.
//!
//! At launch the chosen profile + overrides are frozen into a
//! [`ProfileSnapshot`] (a `Vec<StepSnapshot>` with a profile header) and
//! persisted as the immutable replay record on the launch task — mirroring how
//! `RunContextSnapshot` is a derived, versioned projection.
//!
//! `id` is a stable string slug for the same reason skills use one: builtins
//! need referenceable identities and idempotent seeding (`ON CONFLICT(id)`).

use serde::{Deserialize, Serialize};

use crate::agent::AgentProvider;
use crate::error::CoreError;
use crate::launch_task::LaunchStepKind;
use crate::output_expectation::OutputExpectation;
use crate::reasoning::ReasoningEffort;
use crate::serde_util::default_true;
use crate::session_policy::SessionPolicy;
use crate::skill::{SkillKind, SkillSource};
use crate::step_executor::StepExecutor;

/// The product-level shape of a profile. New profiles are always `Custom` (the
/// only kind `builtins()` ships); the named kinds remain solely to deserialize
/// frozen `profile_snapshot`s from launch tasks created before the agents-in-order
/// simplification, so historical runs still replay.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ProfileKind {
    #[default]
    Standard,
    FastFix,
    PlanOnly,
    ImplementOnly,
    ReviewOnly,
    ClaudeWorkflow,
    ClaudeBackground,
    FullSession,
    Custom,
}

impl ProfileKind {
    pub const fn audit_tag(self) -> &'static str {
        match self {
            Self::Standard => "standard",
            Self::FastFix => "fast_fix",
            Self::PlanOnly => "plan_only",
            Self::ImplementOnly => "implement_only",
            Self::ReviewOnly => "review_only",
            Self::ClaudeWorkflow => "claude_workflow",
            Self::ClaudeBackground => "claude_background",
            Self::FullSession => "full_session",
            Self::Custom => "custom",
        }
    }
}

impl std::fmt::Display for ProfileKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.audit_tag())
    }
}

/// One configured step in a profile. Keyed within its profile by `ordering`
/// (the storage layer enforces `UNIQUE(profile_id, ordering)`); there is no
/// separate step id.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProfileStep {
    pub ordering: u32,
    pub label: String,
    /// References a [`crate::skill::SkillDefinition::id`].
    pub skill_ref: String,
    /// SUP-206 — the app-managed agent (a [`crate::CoreAgentDefinition`] name)
    /// this step's primary execution unit. When the composer attaches an agent
    /// it seeds the provider/model/reasoning/executor fields below from it; the
    /// ref is recorded for lineage and roster grouping. `None` for the
    /// skill-first path, which is unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_ref: Option<String>,
    pub provider: AgentProvider,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default)]
    pub reasoning: ReasoningEffort,
    #[serde(default)]
    pub executor: StepExecutor,
    #[serde(default)]
    pub session_policy: SessionPolicy,
    #[serde(default)]
    pub output_expectation: OutputExpectation,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

/// An editable launch profile.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LaunchProfile {
    pub id: String,
    pub name: String,
    pub kind: ProfileKind,
    #[serde(default)]
    pub is_default: bool,
    /// System profile — re-seeded on factory reset and protected from delete.
    /// Its steps may still be edited and overridden in the composer.
    #[serde(default)]
    pub is_readonly: bool,
    #[serde(default)]
    pub steps: Vec<ProfileStep>,
}

/// A profile that references a given skill or agent, plus the labels of the
/// steps that do. Returned by the reverse-lookup the delete confirm dialog uses
/// to warn the operator that removing a skill/agent will orphan profile steps.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProfileUsage {
    pub id: String,
    pub name: String,
    pub steps: Vec<String>,
}

impl LaunchProfile {
    /// Validate a profile before persistence. Guards operator-authored input;
    /// builtins always pass.
    pub fn validate(&self) -> Result<(), CoreError> {
        if self.id.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "launch profile id must not be empty".into(),
            ));
        }
        if self.name.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "launch profile name must not be empty".into(),
            ));
        }
        let mut orderings: Vec<u32> = self.steps.iter().map(|s| s.ordering).collect();
        orderings.sort_unstable();
        orderings.dedup();
        if orderings.len() != self.steps.len() {
            return Err(CoreError::InvalidInput(
                "launch profile step orderings must be unique".into(),
            ));
        }
        Ok(())
    }

    /// Builtin (read-only) profiles are re-seeded on factory reset and cannot be
    /// deleted; only operator-authored profiles can.
    pub const fn is_deletable(&self) -> bool {
        !self.is_readonly
    }

    /// The single builtin profile: the empty `Custom` container that the
    /// composer fills by picking configured agents in order. `seed_defaults`
    /// writes an editable DB copy; it is the default since it is the only one.
    pub fn builtins() -> Vec<LaunchProfile> {
        vec![profile(
            "custom",
            "Custom",
            ProfileKind::Custom,
            true,
            Vec::new(),
        )]
    }
}

/// A single frozen step in a [`ProfileSnapshot`]. Carries everything the
/// runtime needs to drive the step without re-reading the profile or skill —
/// including the resolved [`SkillSource`] and the [`LaunchStepKind`] used for
/// prompt construction.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StepSnapshot {
    pub ordering: u32,
    pub label: String,
    pub skill_ref: String,
    /// SUP-206 — frozen copy of [`ProfileStep::agent_ref`]. Records the agent
    /// that seeded this step; `None` on the skill-first path and on snapshots
    /// persisted before this field.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_ref: Option<String>,
    pub skill_source: SkillSource,
    /// Resolved [`SkillKind`] of the referenced skill; `None` when the ref
    /// degraded (unknown skill) or on snapshots persisted before this field.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skill_kind: Option<SkillKind>,
    pub step_kind: LaunchStepKind,
    pub provider: AgentProvider,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub reasoning: ReasoningEffort,
    pub executor: StepExecutor,
    pub session_policy: SessionPolicy,
    pub output_expectation: OutputExpectation,
    pub enabled: bool,
}

/// The immutable replay record persisted on a launch task: the resolved
/// profile header plus the frozen step list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProfileSnapshot {
    pub profile_id: String,
    pub profile_name: String,
    pub profile_kind: ProfileKind,
    pub steps: Vec<StepSnapshot>,
}

fn profile(
    id: &str,
    name: &str,
    kind: ProfileKind,
    is_default: bool,
    steps: Vec<ProfileStep>,
) -> LaunchProfile {
    LaunchProfile {
        id: id.to_string(),
        name: name.to_string(),
        kind,
        is_default,
        is_readonly: true,
        steps,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtins_is_only_the_empty_custom_default_container() {
        let builtins = LaunchProfile::builtins();
        assert_eq!(builtins.len(), 1, "only the Custom container ships");
        let custom = &builtins[0];
        assert_eq!(custom.kind, ProfileKind::Custom);
        assert_eq!(custom.id, "custom");
        assert!(custom.steps.is_empty(), "Custom starts blank");
        assert!(custom.is_default, "Custom is the default (only) profile");
    }

    #[test]
    fn validate_rejects_duplicate_orderings() {
        let mut profile = profile(
            "tmp",
            "Tmp",
            ProfileKind::Custom,
            false,
            vec![
                ProfileStep {
                    ordering: 1,
                    label: "a".into(),
                    skill_ref: "implement".into(),
                    agent_ref: None,
                    provider: AgentProvider::Codex,
                    model: None,
                    reasoning: ReasoningEffort::Medium,
                    executor: StepExecutor::CodexStructured,
                    session_policy: SessionPolicy::Fresh,
                    output_expectation: OutputExpectation::Patch,
                    enabled: true,
                },
                ProfileStep {
                    ordering: 2,
                    label: "b".into(),
                    skill_ref: "review".into(),
                    agent_ref: None,
                    provider: AgentProvider::Codex,
                    model: None,
                    reasoning: ReasoningEffort::Medium,
                    executor: StepExecutor::CodexStructured,
                    session_policy: SessionPolicy::Fresh,
                    output_expectation: OutputExpectation::Review,
                    enabled: true,
                },
            ],
        );
        profile.steps[1].ordering = 1;
        assert!(profile.validate().is_err());
    }

    #[test]
    fn builtins_all_validate() {
        for profile in LaunchProfile::builtins() {
            assert!(profile.validate().is_ok());
        }
    }

    #[test]
    fn builtins_are_not_deletable() {
        for profile in LaunchProfile::builtins() {
            assert!(!profile.is_deletable());
        }
    }

    #[test]
    fn step_snapshot_json_without_skill_kind_parses_as_none() {
        let historical = r#"{
            "ordering": 1,
            "label": "Plan",
            "skill_ref": "plan",
            "skill_source": {"kind": "installed", "value": "plan"},
            "step_kind": "plan",
            "provider": "codex",
            "reasoning": "medium",
            "executor": "codex_structured",
            "session_policy": "fresh",
            "output_expectation": "plan",
            "enabled": true
        }"#;
        let snapshot: StepSnapshot = serde_json::from_str(historical).unwrap();
        assert_eq!(snapshot.skill_kind, None);
    }
}
