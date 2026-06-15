//! Launch profiles — editable, ordered step lists.
//!
//! A `LaunchProfile` is a named, reorderable sequence of [`ProfileStep`]s the
//! operator picks (and overrides) in the Launch Composer. The eight builtins
//! ship as canonical code constants ([`LaunchProfile::builtins`]); the runtime
//! seeds editable DB copies. `Standard` reproduces the legacy
//! Plan → Implement → Review recipe and is the default.
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
use crate::role_router::{
    CLAUDE_IMPLEMENT, CLAUDE_PLAN, CLAUDE_REVIEW, CODEX_IMPLEMENT, CODEX_PLAN, CODEX_REVIEW,
};
use crate::serde_util::default_true;
use crate::session_policy::SessionPolicy;
use crate::skill::{SkillKind, SkillSource};
use crate::step_executor::StepExecutor;

/// The product-level shape of a profile. Each named kind appears once among the
/// builtins; `Custom` is the operator-authored bucket.
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

    /// The nine canonical builtin profiles. `seed_defaults` writes editable DB
    /// copies. `Standard` is the default and reproduces the legacy recipe.
    pub fn builtins() -> Vec<LaunchProfile> {
        vec![
            profile(
                "standard",
                "Standard",
                ProfileKind::Standard,
                true,
                vec![codex_plan(1), codex_implement(2), codex_review(3)],
            ),
            profile(
                "fast_fix",
                "Fast fix",
                ProfileKind::FastFix,
                false,
                vec![codex_implement(1), codex_review(2)],
            ),
            profile(
                "plan_only",
                "Plan only",
                ProfileKind::PlanOnly,
                false,
                vec![codex_plan(1)],
            ),
            profile(
                "implement_only",
                "Implement only",
                ProfileKind::ImplementOnly,
                false,
                vec![codex_implement(1)],
            ),
            profile(
                "review_only",
                "Review only",
                ProfileKind::ReviewOnly,
                false,
                vec![codex_review(1)],
            ),
            profile(
                "claude_workflow",
                "Claude workflow",
                ProfileKind::ClaudeWorkflow,
                false,
                vec![claude_plan(1), claude_implement(2), claude_review(3)],
            ),
            profile(
                "claude_background",
                "Claude background",
                ProfileKind::ClaudeBackground,
                false,
                vec![
                    claude_background_plan(1),
                    claude_background_implement(2),
                    claude_background_review(3),
                ],
            ),
            profile(
                "full_session",
                "Full session",
                ProfileKind::FullSession,
                false,
                vec![full_session_ticket(1)],
            ),
            profile("custom", "Custom", ProfileKind::Custom, false, Vec::new()),
        ]
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

fn codex_step(
    ordering: u32,
    skill_ref: &str,
    label: &str,
    output: OutputExpectation,
) -> ProfileStep {
    ProfileStep {
        ordering,
        label: label.to_string(),
        skill_ref: skill_ref.to_string(),
        agent_ref: None,
        provider: AgentProvider::Codex,
        model: None,
        reasoning: ReasoningEffort::Medium,
        executor: StepExecutor::CodexStructured,
        session_policy: SessionPolicy::Fresh,
        output_expectation: output,
        enabled: true,
    }
}

fn claude_step(
    ordering: u32,
    skill_ref: &str,
    label: &str,
    output: OutputExpectation,
) -> ProfileStep {
    ProfileStep {
        provider: AgentProvider::Claude,
        executor: StepExecutor::ClaudeWorkflow,
        ..codex_step(ordering, skill_ref, label, output)
    }
}

fn with_agent(agent: &str, step: ProfileStep) -> ProfileStep {
    ProfileStep {
        agent_ref: Some(agent.to_string()),
        ..step
    }
}
fn codex_plan(ordering: u32) -> ProfileStep {
    with_agent(
        CODEX_PLAN,
        codex_step(ordering, "plan", "Plan", OutputExpectation::Plan),
    )
}
fn codex_implement(ordering: u32) -> ProfileStep {
    with_agent(
        CODEX_IMPLEMENT,
        codex_step(ordering, "implement", "Implement", OutputExpectation::Patch),
    )
}
fn codex_review(ordering: u32) -> ProfileStep {
    with_agent(
        CODEX_REVIEW,
        codex_step(ordering, "review", "Review", OutputExpectation::Review),
    )
}
fn claude_plan(ordering: u32) -> ProfileStep {
    with_agent(
        CLAUDE_PLAN,
        claude_step(ordering, "plan", "Plan", OutputExpectation::Plan),
    )
}
fn claude_implement(ordering: u32) -> ProfileStep {
    with_agent(
        CLAUDE_IMPLEMENT,
        claude_step(ordering, "implement", "Implement", OutputExpectation::Patch),
    )
}
fn claude_review(ordering: u32) -> ProfileStep {
    with_agent(
        CLAUDE_REVIEW,
        claude_step(ordering, "review", "Review", OutputExpectation::Review),
    )
}
fn claude_background_step(
    ordering: u32,
    skill_ref: &str,
    label: &str,
    output: OutputExpectation,
) -> ProfileStep {
    ProfileStep {
        executor: StepExecutor::ClaudeBackground,
        ..claude_step(ordering, skill_ref, label, output)
    }
}
fn claude_background_plan(ordering: u32) -> ProfileStep {
    with_agent(
        CLAUDE_PLAN,
        claude_background_step(ordering, "plan", "Plan", OutputExpectation::Plan),
    )
}
fn claude_background_implement(ordering: u32) -> ProfileStep {
    with_agent(
        CLAUDE_IMPLEMENT,
        claude_background_step(ordering, "implement", "Implement", OutputExpectation::Patch),
    )
}
fn claude_background_review(ordering: u32) -> ProfileStep {
    with_agent(
        CLAUDE_REVIEW,
        claude_background_step(ordering, "review", "Review", OutputExpectation::Review),
    )
}
fn full_session_ticket(ordering: u32) -> ProfileStep {
    ProfileStep {
        executor: StepExecutor::InteractivePty,
        reasoning: ReasoningEffort::High,
        ..claude_step(
            ordering,
            "ticket",
            "Ticket (full session)",
            OutputExpectation::Patch,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtins_cover_the_canonical_profiles() {
        let kinds: Vec<_> = LaunchProfile::builtins()
            .into_iter()
            .map(|p| p.kind)
            .collect();
        assert_eq!(
            kinds,
            [
                ProfileKind::Standard,
                ProfileKind::FastFix,
                ProfileKind::PlanOnly,
                ProfileKind::ImplementOnly,
                ProfileKind::ReviewOnly,
                ProfileKind::ClaudeWorkflow,
                ProfileKind::ClaudeBackground,
                ProfileKind::FullSession,
                ProfileKind::Custom,
            ]
        );
    }

    #[test]
    fn claude_background_builtin_uses_subscription_background_executor() {
        let profile = LaunchProfile::builtins()
            .into_iter()
            .find(|p| p.kind == ProfileKind::ClaudeBackground)
            .expect("claude_background builtin");
        assert_eq!(profile.steps.len(), 3);
        assert!(
            profile
                .steps
                .iter()
                .all(|s| s.provider == AgentProvider::Claude
                    && s.executor == StepExecutor::ClaudeBackground)
        );
        // Subscription path: no builtin step is on the paid SDK path.
        assert!(!profile.steps.iter().any(|s| s.executor.is_paid_sdk()));
    }

    #[test]
    fn full_session_builtin_runs_the_ticket_skill_on_an_interactive_pty() {
        let full_session = LaunchProfile::builtins()
            .into_iter()
            .find(|p| p.kind == ProfileKind::FullSession)
            .expect("full_session builtin");
        assert_eq!(full_session.id, "full_session");
        assert_eq!(full_session.steps.len(), 1);
        let step = &full_session.steps[0];
        assert_eq!(step.skill_ref, "ticket");
        assert_eq!(step.provider, AgentProvider::Claude);
        assert_eq!(step.executor, StepExecutor::InteractivePty);
        assert_eq!(step.reasoning, ReasoningEffort::High);
        assert_eq!(step.session_policy, SessionPolicy::Fresh);
        assert_eq!(step.output_expectation, OutputExpectation::Patch);
        assert!(step.enabled);
    }

    #[test]
    fn standard_is_the_only_default_and_each_step_is_agent_primary() {
        let builtins = LaunchProfile::builtins();
        let defaults: Vec<_> = builtins.iter().filter(|p| p.is_default).collect();
        assert_eq!(defaults.len(), 1);
        let standard = defaults[0];
        assert_eq!(standard.kind, ProfileKind::Standard);
        let refs: Vec<_> = standard
            .steps
            .iter()
            .map(|s| s.skill_ref.as_str())
            .collect();
        assert_eq!(refs, ["plan", "implement", "review"]);
        assert!(
            standard
                .steps
                .iter()
                .all(|s| s.executor == StepExecutor::CodexStructured)
        );
        // SUP-206 V2 — Standard's steps are agent-primary: each names a built-in
        // codex agent. The step's provider/executor/reasoning are unchanged, but
        // launch is NO LONGER byte-for-byte the legacy skill-first recipe — at
        // resolution the agent deep-carries its policy (the planner's Linear MCP,
        // the reviewer's bash/write deny) and the agent's attached skills are
        // what materialise. This is the intended convergence under
        // "agent = primary unit"; the runner mode still rides on the executor.
        let agent_refs: Vec<_> = standard
            .steps
            .iter()
            .map(|s| s.agent_ref.as_deref())
            .collect();
        assert_eq!(
            agent_refs,
            [Some(CODEX_PLAN), Some(CODEX_IMPLEMENT), Some(CODEX_REVIEW)]
        );
        assert!(
            standard
                .steps
                .iter()
                .all(|s| s.provider == AgentProvider::Codex
                    && s.reasoning == ReasoningEffort::Medium)
        );
    }

    #[test]
    fn claude_workflow_is_the_only_builtin_on_the_paid_path() {
        for profile in LaunchProfile::builtins() {
            let paid = profile.steps.iter().any(|s| s.executor.is_paid_sdk());
            assert_eq!(paid, profile.kind == ProfileKind::ClaudeWorkflow);
        }
    }

    #[test]
    fn custom_builtin_has_no_steps() {
        let custom = LaunchProfile::builtins()
            .into_iter()
            .find(|p| p.kind == ProfileKind::Custom)
            .unwrap();
        assert!(custom.steps.is_empty());
    }

    #[test]
    fn validate_rejects_duplicate_orderings() {
        let mut profile = LaunchProfile::builtins().remove(0);
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
