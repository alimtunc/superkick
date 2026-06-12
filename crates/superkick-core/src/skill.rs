//! App-managed skill definitions.
//!
//! A skill is an editable, named unit of work a launch step performs. The five
//! builtins (Plan / Implement / Review / Pre-PR Review / Ticket) ship as
//! canonical code constants ([`SkillDefinition::builtins`]); `seed_defaults`
//! writes editable DB copies of them ("factory reset = re-seed"). Operators may
//! also author free-form custom skills from scratch.
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

/// Where a file-backed managed skill is materialised inside the worktree.
/// `Skill` writes `.claude/skills/<name>/SKILL.md` (read via `/name`);
/// `Command` writes `.claude/commands/<name>.md`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SkillArtifact {
    #[default]
    Skill,
    Command,
}

impl SkillArtifact {
    pub const fn audit_tag(self) -> &'static str {
        match self {
            Self::Skill => "skill",
            Self::Command => "command",
        }
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
    /// Discovered in a configured import dir and persisted as a managed
    /// skill — distinguishable from hand-authored `Custom`.
    Imported,
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
    #[serde(default = "crate::serde_util::default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub origin: SkillOrigin,
    /// Markdown body for file-backed managed skills, materialised into the
    /// worktree at launch. `None` for pure `Installed`/`Prompt` skills whose
    /// instructions resolve elsewhere. Never inlined into a prompt, so it is
    /// not subject to [`MAX_PROMPT_TEMPLATE_CHARS`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    /// Materialisation target for `body`.
    #[serde(default)]
    pub artifact_kind: SkillArtifact,
}

/// Upper bound on an inline `Prompt` template, which is injected verbatim into
/// the step prompt. `body` (file-backed, read by the LLM from disk) is exempt.
pub const MAX_PROMPT_TEMPLATE_CHARS: usize = 16_000;

impl SkillDefinition {
    /// Validate a skill before it is persisted. Builtins are constructed
    /// internally and always pass; this guards operator-authored input.
    pub fn validate(&self) -> Result<(), CoreError> {
        if self.id.trim().is_empty() {
            return Err(CoreError::InvalidInput("skill id must not be empty".into()));
        }
        // `id` is interpolated into a worktree path at materialise time, so it
        // must be a safe slug — no `/`, `.`, `..`, whitespace, or uppercase.
        if !is_safe_skill_id(&self.id) {
            return Err(CoreError::InvalidInput(format!(
                "skill id `{}` is not a safe slug (expected ^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$)",
                self.id
            )));
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
        if let SkillSource::Prompt(template) = &self.source {
            if template.chars().count() > MAX_PROMPT_TEMPLATE_CHARS {
                return Err(CoreError::InvalidInput(format!(
                    "skill prompt template exceeds {MAX_PROMPT_TEMPLATE_CHARS} characters"
                )));
            }
        }
        Ok(())
    }

    /// Builtin skills are re-seeded on factory reset and cannot be deleted
    /// (disable them instead); operator-authored and imported skills can.
    pub const fn is_deletable(&self) -> bool {
        matches!(self.origin, SkillOrigin::Custom | SkillOrigin::Imported)
    }

    /// The five canonical builtin skills. `seed_defaults` writes editable DB
    /// copies; these constants remain the source of truth for a factory reset.
    /// Each carries its real instruction text as an editable `body`, sourced
    /// from a markdown file so the prose lives as readable text rather than a
    /// Rust string literal. The runtime executes this `body`; the completion
    /// contract and Linear guardrail are appended at spawn, not stored here.
    pub fn builtins() -> Vec<SkillDefinition> {
        vec![
            builtin(
                "plan",
                "Plan",
                SkillKind::Plan,
                OutputExpectation::Plan,
                include_str!("builtin_skills/plan.md"),
            ),
            builtin(
                "implement",
                "Implement",
                SkillKind::Implement,
                OutputExpectation::Patch,
                include_str!("builtin_skills/implement.md"),
            ),
            builtin(
                "review",
                "Review",
                SkillKind::Review,
                OutputExpectation::Review,
                include_str!("builtin_skills/review.md"),
            ),
            builtin(
                "pre_pr_review",
                "Pre-PR Review",
                SkillKind::PrePrReview,
                OutputExpectation::Review,
                include_str!("builtin_skills/pre_pr_review.md"),
            ),
            ticket_builtin(),
        ]
    }
}

/// A skill `id` becomes a path segment (`.claude/skills/<id>/SKILL.md`) at
/// materialise time, so it must match `^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$`:
/// lowercase alphanumerics with interior hyphens/underscores only (the
/// builtin `pre_pr_review` uses underscores). This rejects `/`, `.`, `..`,
/// whitespace, and uppercase before any value reaches the filesystem.
fn is_safe_skill_id(id: &str) -> bool {
    let edges_alnum = |b: u8| b.is_ascii_lowercase() || b.is_ascii_digit();
    let Some(first) = id.bytes().next() else {
        return false;
    };
    let Some(last) = id.bytes().last() else {
        return false;
    };
    edges_alnum(first)
        && edges_alnum(last)
        && id.bytes().all(|b| edges_alnum(b) || b == b'-' || b == b'_')
}

fn builtin(
    id: &str,
    label: &str,
    kind: SkillKind,
    output: OutputExpectation,
    body: &str,
) -> SkillDefinition {
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
        body: Some(body.to_string()),
        artifact_kind: SkillArtifact::Skill,
    }
}

fn ticket_builtin() -> SkillDefinition {
    SkillDefinition {
        default_provider: AgentProvider::Claude,
        default_reasoning: ReasoningEffort::High,
        default_executor: StepExecutor::InteractivePty,
        ..builtin(
            "ticket",
            "Ticket (A→Z)",
            SkillKind::Custom,
            OutputExpectation::Patch,
            include_str!("builtin_skills/ticket.md"),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtins_cover_the_five_default_skills() {
        let builtins = SkillDefinition::builtins();
        let ids: Vec<_> = builtins.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(
            ids,
            ["plan", "implement", "review", "pre_pr_review", "ticket"]
        );
        assert!(builtins.iter().all(|s| s.origin == SkillOrigin::Builtin));
        assert!(builtins.iter().all(|s| s.validate().is_ok()));
    }

    #[test]
    fn recipe_builtins_default_to_codex_structured_never_paid_sdk() {
        for skill in SkillDefinition::builtins() {
            assert!(!skill.default_executor.is_paid_sdk());
            if skill.id != "ticket" {
                assert_eq!(skill.default_provider, AgentProvider::Codex);
                assert_eq!(skill.default_executor, StepExecutor::CodexStructured);
            }
        }
    }

    #[test]
    fn ticket_builtin_targets_claude_on_an_interactive_pty() {
        let ticket = SkillDefinition::builtins()
            .into_iter()
            .find(|s| s.id == "ticket")
            .expect("ticket builtin");
        assert_eq!(ticket.label, "Ticket (A→Z)");
        assert_eq!(ticket.kind, SkillKind::Custom);
        assert_eq!(ticket.source, SkillSource::Installed("ticket".into()));
        assert_eq!(ticket.default_provider, AgentProvider::Claude);
        assert_eq!(ticket.default_model, None);
        assert_eq!(ticket.default_reasoning, ReasoningEffort::High);
        assert_eq!(ticket.default_executor, StepExecutor::InteractivePty);
        assert_eq!(ticket.default_session_policy, SessionPolicy::Fresh);
        assert_eq!(ticket.default_output_expectation, OutputExpectation::Patch);
        assert!(ticket.enabled);
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
    fn builtins_carry_an_editable_body_as_a_file_backed_skill() {
        for skill in SkillDefinition::builtins() {
            let body = skill.body.as_deref().unwrap_or_default();
            assert!(
                !body.trim().is_empty(),
                "builtin `{}` must ship a non-empty body",
                skill.id
            );
            assert_eq!(skill.artifact_kind, SkillArtifact::Skill);
        }
    }

    #[test]
    fn validate_rejects_unsafe_skill_ids() {
        let mut skill = SkillDefinition::builtins().remove(0);
        skill.origin = SkillOrigin::Custom;
        for bad in [
            "../etc", "a/b", "..", ".", "foo.bar", "Foo", "foo bar", "-foo", "foo-", "_foo",
        ] {
            skill.id = bad.into();
            assert!(skill.validate().is_err(), "expected `{bad}` to be rejected");
        }
    }

    #[test]
    fn validate_accepts_safe_skill_ids() {
        let mut skill = SkillDefinition::builtins().remove(0);
        skill.origin = SkillOrigin::Custom;
        for good in [
            "plan",
            "pre_pr_review",
            "pre-pr-review",
            "ticket",
            "a",
            "x1",
            "1step",
        ] {
            skill.id = good.into();
            skill.source = SkillSource::Installed(good.into());
            assert!(skill.validate().is_ok(), "expected `{good}` to be accepted");
        }
    }

    #[test]
    fn validate_caps_inline_prompt_templates() {
        let mut skill = SkillDefinition::builtins().remove(0);
        skill.origin = SkillOrigin::Custom;
        skill.source = SkillSource::Prompt("x".repeat(MAX_PROMPT_TEMPLATE_CHARS));
        assert!(skill.validate().is_ok());
        skill.source = SkillSource::Prompt("x".repeat(MAX_PROMPT_TEMPLATE_CHARS + 1));
        assert!(skill.validate().is_err());
    }

    #[test]
    fn validate_does_not_cap_file_backed_body() {
        let mut skill = SkillDefinition::builtins().remove(0);
        skill.origin = SkillOrigin::Imported;
        skill.body = Some("x".repeat(MAX_PROMPT_TEMPLATE_CHARS * 4));
        assert!(skill.validate().is_ok());
    }

    #[test]
    fn serde_round_trip() {
        let skill = SkillDefinition::builtins().remove(2);
        let json = serde_json::to_string(&skill).unwrap();
        let back: SkillDefinition = serde_json::from_str(&json).unwrap();
        assert_eq!(back, skill);
    }

    #[test]
    fn serde_round_trip_with_body_and_command_artifact() {
        let mut skill = SkillDefinition::builtins().remove(0);
        skill.origin = SkillOrigin::Imported;
        skill.body = Some("# heading\n\nmarkdown body".into());
        skill.artifact_kind = SkillArtifact::Command;
        let json = serde_json::to_string(&skill).unwrap();
        let back: SkillDefinition = serde_json::from_str(&json).unwrap();
        assert_eq!(back, skill);
    }

    #[test]
    fn deserialize_back_compat_without_body_or_artifact_kind() {
        let json = r#"{
            "id": "legacy",
            "label": "Legacy",
            "kind": "custom",
            "source": { "kind": "installed", "value": "legacy" },
            "default_provider": "codex"
        }"#;
        let skill: SkillDefinition = serde_json::from_str(json).unwrap();
        assert_eq!(skill.body, None);
        assert_eq!(skill.artifact_kind, SkillArtifact::Skill);
        assert_eq!(skill.origin, SkillOrigin::Custom);
    }
}
