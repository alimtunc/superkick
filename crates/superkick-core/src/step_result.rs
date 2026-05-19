//! Structured per-step completion payload and marker constants.

use serde::{Deserialize, Serialize};

/// Outer marker the agent prints on its own line **before** the JSON payload.
pub const STEP_RESULT_BEGIN: &str = "SUPERKICK_STEP_RESULT_BEGIN";

/// Outer marker the agent prints on its own line **after** the JSON payload.
pub const STEP_RESULT_END: &str = "SUPERKICK_STEP_RESULT_END";

/// Terminal status the agent reports for the step.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StepResultStatus {
    Completed,
    NeedsHuman,
    Failed,
}

/// Structured payload extracted from the marker block (PTY) or built from the structured-runner completion event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StepResult {
    pub status: StepResultStatus,
    pub summary: String,
    #[serde(default)]
    pub changed_files: Vec<String>,
    #[serde(default)]
    pub questions: Vec<String>,
}

impl StepResult {
    /// Best-effort JSON decode; callers log and fall back on `None`.
    pub fn try_from_json(raw: &str) -> Option<Self> {
        serde_json::from_str(raw).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn step_result_round_trips() {
        let sr = StepResult {
            status: StepResultStatus::Completed,
            summary: "did the thing".into(),
            changed_files: vec!["a.rs".into(), "b.rs".into()],
            questions: vec![],
        };
        let json = serde_json::to_string(&sr).expect("serialize");
        let back = StepResult::try_from_json(&json).expect("parse");
        assert_eq!(back, sr);
    }

    #[test]
    fn step_result_accepts_missing_optional_fields() {
        let json = r#"{"status":"needs_human","summary":"why?"}"#;
        let sr = StepResult::try_from_json(json).expect("parse");
        assert_eq!(sr.status, StepResultStatus::NeedsHuman);
        assert_eq!(sr.summary, "why?");
        assert!(sr.changed_files.is_empty());
        assert!(sr.questions.is_empty());
    }

    #[test]
    fn step_result_serializes_status_in_snake_case() {
        let sr = StepResult {
            status: StepResultStatus::NeedsHuman,
            summary: "x".into(),
            changed_files: vec![],
            questions: vec![],
        };
        let json = serde_json::to_string(&sr).expect("serialize");
        assert!(json.contains("\"needs_human\""), "got {json}");
    }

    #[test]
    fn try_from_json_returns_none_on_malformed_input() {
        assert!(StepResult::try_from_json("not json").is_none());
        assert!(StepResult::try_from_json(r#"{"status":"bogus","summary":"x"}"#).is_none());
    }

    #[test]
    fn markers_are_ascii_only() {
        assert!(STEP_RESULT_BEGIN.is_ascii());
        assert!(STEP_RESULT_END.is_ascii());
        assert_ne!(STEP_RESULT_BEGIN, STEP_RESULT_END);
    }
}
