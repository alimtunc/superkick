//! App-managed skill definitions.
//!
//! A skill is an editable, named unit of work a launch step performs. The four
//! builtins (Plan / Implement / Review / Pre-PR Review) ship as canonical code
//! constants ([`SkillDefinition::builtins`]); `seed_defaults` writes editable
//! DB copies of them ("factory reset = re-seed"). Operators may also author
//! free-form custom skills from scratch.
//!
//! `id` is a stable string slug rather than a UUID: builtins need referenceable
//! identities (`"plan"`, `"review"`, …) so profile steps can point at them and
//! seeding stays idempotent. This mirrors how `agent_name` is a free-form
//! catalog reference with no SQL FK.

use serde::{Deserialize, Serialize};

use crate::agent::AgentProvider;
use crate::error::CoreError;
use crate::output_expectation::OutputExpectation;
use crate::reasoning::ReasoningEffort;
use crate::session_policy::SessionPolicy;
use crate::step_executor::StepExecutor;

/// Where a skill's step instructions come from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum SkillSource {
    /// Name of an installed agent skill / builtin recipe step (e.g. `"plan"`),
    /// resolved by the runtime to its prompt path.
    Installed(String),
    /// Inline prompt template used verbatim as the step instructions.
    Prompt(String),
}

impl SkillSource {
    /// Discriminant stored in the `skill_source_kind` column.
    pub const fn kind_tag(&self) -> &'static str {
        match self {
            Self::Installed(_) => "installed",
            Self::Prompt(_) => "prompt",
        }
    }

    /// Payload stored in the `skill_source_value` column.
    pub fn value(&self) -> &str {
        match self {
            Self::Installed(v) | Self::Prompt(v) => v.as_str(),
        }
    }

    /// Recompose from the persisted `(kind, value)` column pair.
    pub fn from_parts(kind: &str, value: String) -> Result<Self, CoreError> {
        match kind {
            "installed" => Ok(Self::Installed(value)),
            "prompt" => Ok(Self::Prompt(value)),
            other => Err(CoreError::InvalidInput(format!(
                "unknown skill_source kind `{other}`"
            ))),
        }
    }
}

/// What category of work a skill performs. Drives the default step-kind a
/// composed step maps to and groups skills in the picker.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SkillKind {
    Plan,
    Implement,
    Review,
    PrePrReview,
    #[default]
    Custom,
}

impl SkillKind {
    pub const fn audit_tag(self) -> &'static str {
        match self {
            Self::Plan => "plan",
            Self::Implement => "implement",
            Self::Review => "review",
            Self::PrePrReview => "pre_pr_review",
            Self::Custom => "custom",
        }
    }
}

impl std::fmt::Display for SkillKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.audit_tag())
    }
}

/// Whether a skill is Superkick-shipped or operator-authored. Mirrors
/// [`crate::role_router::AgentOrigin`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SkillOrigin {
    Builtin,
    #[default]
    Custom,
}

impl SkillOrigin {
    pub const fn audit_tag(self) -> &'static str {
        match self {
            Self::Builtin => "builtin",
            Self::Custom => "custom",
        }
    }
}

/// An editable skill definition. The `default_*` fields seed a profile step's
/// columns when the skill is first dropped onto a profile; the step then
/// snapshots its own copy so a later skill edit never rewrites a live launch.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillDefinition {
    pub id: String,
    pub label: String,
    pub kind: SkillKind,
    pub source: SkillSource,
    pub default_provider: AgentProvider,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    #[serde(default)]
    pub default_reasoning: ReasoningEffort,
    #[serde(default)]
    pub default_executor: StepExecutor,
    #[serde(default)]
    pub default_session_policy: SessionPolicy,
    #[serde(default)]
    pub default_output_expectation: OutputExpectation,
    #[serde(default = "crate::skill::default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub origin: SkillOrigin,
}

pub(crate) const fn default_true() -> bool {
    true
}

impl SkillDefinition {
    /// Validate a skill before it is persisted. Builtins are constructed
    /// internally and always pass; this guards operator-authored input.
    pub fn validate(&self) -> Result<(), CoreError> {
        if self.id.trim().is_empty() {
            return Err(CoreError::InvalidInput("skill id must not be empty".into()));
        }
        if self.label.trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "skill label must not be empty".into(),
            ));
        }
        if self.source.value().trim().is_empty() {
            return Err(CoreError::InvalidInput(
                "skill source must not be empty".into(),
            ));
        }
        Ok(())
    }

    /// Builtin skills are re-seeded on factory reset and cannot be deleted
    /// (disable them instead); only operator-authored skills can.
    pub const fn is_deletable(&self) -> bool {
        matches!(self.origin, SkillOrigin::Custom)
    }

    /// The four canonical builtin skills. `seed_defaults` writes editable DB
    /// copies; these constants remain the source of truth for a factory reset.
    pub fn builtins() -> Vec<SkillDefinition> {
        vec![
            builtin("plan", "Plan", SkillKind::Plan, OutputExpectation::Plan),
            builtin(
                "implement",
                "Implement",
                SkillKind::Implement,
                OutputExpectation::Patch,
            ),
            builtin(
                "review",
                "Review",
                SkillKind::Review,
                OutputExpectation::Review,
            ),
            builtin(
                "pre_pr_review",
                "Pre-PR Review",
                SkillKind::PrePrReview,
                OutputExpectation::Review,
            ),
        ]
    }
}

fn builtin(id: &str, label: &str, kind: SkillKind, output: OutputExpectation) -> SkillDefinition {
    SkillDefinition {
        id: id.to_string(),
        label: label.to_string(),
        kind,
        source: SkillSource::Installed(id.to_string()),
        default_provider: AgentProvider::Codex,
        default_model: None,
        default_reasoning: ReasoningEffort::Medium,
        default_executor: StepExecutor::CodexStructured,
        default_session_policy: SessionPolicy::Fresh,
        default_output_expectation: output,
        enabled: true,
        origin: SkillOrigin::Builtin,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtins_cover_the_four_default_skills() {
        let builtins = SkillDefinition::builtins();
        let ids: Vec<_> = builtins.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, ["plan", "implement", "review", "pre_pr_review"]);
        assert!(builtins.iter().all(|s| s.origin == SkillOrigin::Builtin));
        assert!(builtins.iter().all(|s| s.validate().is_ok()));
    }

    #[test]
    fn builtins_default_to_codex_structured_never_paid_sdk() {
        for skill in SkillDefinition::builtins() {
            assert_eq!(skill.default_provider, AgentProvider::Codex);
            assert_eq!(skill.default_executor, StepExecutor::CodexStructured);
            assert!(!skill.default_executor.is_paid_sdk());
        }
    }

    #[test]
    fn builtin_skills_are_not_deletable() {
        for skill in SkillDefinition::builtins() {
            assert!(!skill.is_deletable());
        }
    }

    #[test]
    fn skill_source_round_trips_through_parts() {
        let installed = SkillSource::Installed("plan".into());
        let prompt = SkillSource::Prompt("do the thing".into());
        for source in [installed, prompt] {
            let back =
                SkillSource::from_parts(source.kind_tag(), source.value().to_string()).unwrap();
            assert_eq!(back, source);
        }
        assert!(SkillSource::from_parts("bogus", "x".into()).is_err());
    }

    #[test]
    fn validate_rejects_blank_fields() {
        let mut skill = SkillDefinition::builtins().remove(0);
        skill.id = "  ".into();
        assert!(skill.validate().is_err());
    }

    #[test]
    fn serde_round_trip() {
        let skill = SkillDefinition::builtins().remove(2);
        let json = serde_json::to_string(&skill).unwrap();
        let back: SkillDefinition = serde_json::from_str(&json).unwrap();
        assert_eq!(back, skill);
    }
}
