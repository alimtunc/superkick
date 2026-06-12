//! Shared per-step prompt bodies for agent steps.
//!
//! Used by both the playbook `StepEngine` (`execute_agent`) and the Launch
//! Task `RealStepRunner`. Keeping the wording in one place prevents guardrail
//! drift — every body must carry the "Do NOT update the issue status" rule
//! and the step-completion contract, and two callers maintaining their own
//! copies silently diverged before.

use superkick_core::{STEP_RESULT_BEGIN, STEP_RESULT_END};

/// Selects which body wording to render. The caller supplies its own
/// preamble; this enum only picks the body.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptStepKind {
    Plan,
    Implement,
    Review,
}

/// The guardrail every agent step shares. Exposed so the rare fallback
/// branches (unknown `StepKey` variants) can append it without duplicating
/// the wording.
pub const NO_LINEAR_UPDATE_GUARDRAIL: &str = "IMPORTANT: Do NOT update the issue status in Linear or any external tracker. \
     Do NOT mark the issue as done, closed, or resolved.";

/// Operator-facing block telling the agent how to declare completion. The marker literals are interpolated from the parser's constants so the two cannot drift.
pub fn step_result_contract_prompt() -> String {
    format!(
        "--- Step completion contract ---\n\
         When and only when this step is fully done, print the following block on its own lines, \
         with nothing before BEGIN and nothing after END on those lines:\n\n\
         {STEP_RESULT_BEGIN}\n\
         {{\"status\":\"completed|needs_human|failed\",\"summary\":\"...\",\"changed_files\":[\"...\"],\"questions\":[\"...\"]}}\n\
         {STEP_RESULT_END}\n\n\
         Without this block the step will not be marked complete and an operator will be paged."
    )
}

/// Wrap an editable skill `body` into a step instruction block: the body
/// verbatim, then the shared Linear guardrail and the step-completion contract.
/// This is the body-driven counterpart to [`step_body_for`] — when a step's
/// skill carries a non-empty body, the body *is* the instructions, so every
/// edit to the body changes behaviour on every prompt path.
pub fn skill_body_instructions(body: &str) -> String {
    format!(
        "{body}\n\n{NO_LINEAR_UPDATE_GUARDRAIL}\n\n{}",
        step_result_contract_prompt()
    )
}

/// Render the body for one step kind. Callers prepend their own preamble
/// (e.g. "You are working on issue X (id: …)") so the same body works for
/// both playbook runs and Launch Tasks. Every body appends the completion
/// contract so the runtime can parse the marker block.
pub fn step_body_for(kind: PromptStepKind) -> String {
    let body = match kind {
        PromptStepKind::Plan => format!(
            "Analyze the codebase and produce a detailed implementation plan. \
             Describe the files to change, the approach, and any risks. \
             Do NOT make code changes yet — only plan. \
             {NO_LINEAR_UPDATE_GUARDRAIL} Only plan the implementation."
        ),
        PromptStepKind::Implement => format!(
            "Implement the changes needed to resolve this issue. \
             Follow the existing code style and patterns. \
             Make all necessary code changes. \
             {NO_LINEAR_UPDATE_GUARDRAIL} Only write code."
        ),
        PromptStepKind::Review => format!(
            "Review the changes on this branch for bugs, logic errors, \
             security issues, and code quality. If the code looks good, \
             say 'LGTM'. If there are issues, list them clearly. \
             {NO_LINEAR_UPDATE_GUARDRAIL} Only review code."
        ),
    };
    format!("{body}\n\n{}", step_result_contract_prompt())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_body_contains_the_no_linear_update_guardrail() {
        for kind in [
            PromptStepKind::Plan,
            PromptStepKind::Implement,
            PromptStepKind::Review,
        ] {
            assert!(
                step_body_for(kind).contains("Do NOT update the issue status"),
                "{kind:?} body missing guardrail"
            );
        }
    }

    #[test]
    fn plan_body_forbids_code_changes() {
        assert!(step_body_for(PromptStepKind::Plan).contains("only plan"));
    }

    #[test]
    fn implement_body_directs_only_code() {
        assert!(step_body_for(PromptStepKind::Implement).contains("Only write code"));
    }

    #[test]
    fn review_body_directs_only_review() {
        assert!(step_body_for(PromptStepKind::Review).contains("Only review code"));
    }

    #[test]
    fn skill_body_instructions_inlines_body_with_guardrail_and_contract() {
        let out = skill_body_instructions("CUSTOM SKILL BODY TEXT");
        assert!(
            out.contains("CUSTOM SKILL BODY TEXT"),
            "body inlined verbatim"
        );
        assert!(
            out.contains("Do NOT update the issue status"),
            "guardrail appended"
        );
        assert!(
            out.contains(superkick_core::STEP_RESULT_BEGIN),
            "contract BEGIN appended"
        );
        assert!(
            out.contains(superkick_core::STEP_RESULT_END),
            "contract END appended"
        );
    }

    #[test]
    fn every_body_includes_the_step_result_contract() {
        for kind in [
            PromptStepKind::Plan,
            PromptStepKind::Implement,
            PromptStepKind::Review,
        ] {
            let body = step_body_for(kind);
            assert!(
                body.contains(superkick_core::STEP_RESULT_BEGIN),
                "{kind:?} body missing BEGIN marker"
            );
            assert!(
                body.contains(superkick_core::STEP_RESULT_END),
                "{kind:?} body missing END marker"
            );
        }
    }
}
