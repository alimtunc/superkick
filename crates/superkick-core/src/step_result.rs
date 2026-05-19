//! Structured per-step completion payload and marker constants.

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::agent::AgentProvider;

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

/// Runtime-side verdict on why a step did not reach `Completed`.
///
/// Layered on top of the agent's self-reported [`StepResult`]: the runtime
/// classifier inspects the agent's marker, the supervisor lifecycle phase,
/// spawn errors, and transcript hints, and emits exactly one variant. The
/// disposition (see [`disposition`]) decides whether the step can be retried
/// from `NeedsHuman` or whether it is terminal `Failed`.
///
/// [`disposition`]: FailureClassification::disposition
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FailureClassification {
    MissingMarker,
    MalformedMarker {
        detail: String,
    },
    AgentReported {
        status: StepResultStatus,
        summary: String,
    },
    AuthRequired {
        provider: AgentProvider,
    },
    QuotaExceeded {
        provider: AgentProvider,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        reset_at: Option<String>,
    },
    CliMissing {
        binary: String,
        install_hint: String,
    },
    Timeout {
        #[serde(with = "duration_millis")]
        after: Duration,
    },
    NoDiff,
    TestsFailed {
        summary: String,
    },
    SpawnError {
        detail: String,
    },
    AgentNonZeroExit {
        exit_code: i32,
        role: String,
    },
}

/// Whether a classified failure can be retried by an operator (`NeedsHuman`)
/// or whether re-running in place will not help (`Failed`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureDisposition {
    NeedsHuman,
    Failed,
}

impl FailureClassification {
    /// Map the classification to the step/task disposition the executor should
    /// take. `NeedsHuman` keeps SUP-120 retry semantics; `Failed` is terminal.
    pub fn disposition(&self) -> FailureDisposition {
        use FailureClassification::*;
        match self {
            MissingMarker
            | MalformedMarker { .. }
            | AuthRequired { .. }
            | QuotaExceeded { .. }
            | Timeout { .. }
            | NoDiff
            | TestsFailed { .. }
            | AgentNonZeroExit { .. } => FailureDisposition::NeedsHuman,
            CliMissing { .. } | SpawnError { .. } => FailureDisposition::Failed,
            AgentReported { status, .. } => match status {
                StepResultStatus::NeedsHuman => FailureDisposition::NeedsHuman,
                StepResultStatus::Failed => FailureDisposition::Failed,
                // Defensive: `Completed` should never reach the classifier.
                StepResultStatus::Completed => FailureDisposition::NeedsHuman,
            },
        }
    }

    /// Short, operator-readable one-line summary.
    pub fn human_summary(&self) -> String {
        use FailureClassification::*;
        match self {
            MissingMarker => "agent finished without emitting a step-result marker".into(),
            MalformedMarker { detail } => format!("step-result marker was malformed: {detail}"),
            AgentReported { status, summary } => {
                let label = match status {
                    StepResultStatus::Completed => "completed",
                    StepResultStatus::NeedsHuman => "needs_human",
                    StepResultStatus::Failed => "failed",
                };
                format!("agent reported {label}: {summary}")
            }
            AuthRequired { provider } => format!("{provider} authentication required"),
            QuotaExceeded {
                provider,
                reset_at: Some(reset),
            } => format!("{provider} quota exhausted (resets at {reset})"),
            QuotaExceeded {
                provider,
                reset_at: None,
            } => format!("{provider} quota exhausted"),
            CliMissing {
                binary,
                install_hint,
            } => format!("{binary} CLI not found on PATH — {install_hint}"),
            Timeout { after } => format!("step exceeded wall-clock budget ({}s)", after.as_secs()),
            NoDiff => "implement step completed cleanly but produced no diff".into(),
            TestsFailed { summary } => format!("tests reported failures: {summary}"),
            SpawnError { detail } => format!("could not spawn agent: {detail}"),
            AgentNonZeroExit { exit_code, role } => {
                format!("{role} agent exited with code {exit_code}")
            }
        }
    }
}

mod duration_millis {
    use std::time::Duration;

    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S: Serializer>(d: &Duration, s: S) -> Result<S::Ok, S::Error> {
        (d.as_millis() as u64).serialize(s)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Duration, D::Error> {
        let raw = u64::deserialize(d)?;
        Ok(Duration::from_millis(raw))
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

    #[test]
    fn failure_classification_round_trips_via_json() {
        let cases = [
            FailureClassification::MissingMarker,
            FailureClassification::MalformedMarker {
                detail: "expected `{`, found `x`".into(),
            },
            FailureClassification::AgentReported {
                status: StepResultStatus::NeedsHuman,
                summary: "stuck on auth".into(),
            },
            FailureClassification::AuthRequired {
                provider: AgentProvider::Claude,
            },
            FailureClassification::QuotaExceeded {
                provider: AgentProvider::Claude,
                reset_at: Some("3:42pm".into()),
            },
            FailureClassification::QuotaExceeded {
                provider: AgentProvider::Codex,
                reset_at: None,
            },
            FailureClassification::CliMissing {
                binary: "claude".into(),
                install_hint: "brew install anthropics/cli/claude".into(),
            },
            FailureClassification::Timeout {
                after: Duration::from_secs(1800),
            },
            FailureClassification::NoDiff,
            FailureClassification::TestsFailed {
                summary: "3 failures in fooctl::tests".into(),
            },
            FailureClassification::SpawnError {
                detail: "permission denied".into(),
            },
            FailureClassification::AgentNonZeroExit {
                exit_code: 137,
                role: "implementer".into(),
            },
        ];
        for case in cases {
            let json = serde_json::to_string(&case).expect("serialize");
            let back: FailureClassification = serde_json::from_str(&json).expect("parse");
            assert_eq!(back, case, "round-trip via {json}");
        }
    }

    #[test]
    fn failure_classification_serializes_tagged_kind() {
        let c = FailureClassification::CliMissing {
            binary: "claude".into(),
            install_hint: "see README".into(),
        };
        let json = serde_json::to_string(&c).expect("serialize");
        assert!(json.contains("\"kind\":\"cli_missing\""), "got {json}");
    }

    #[test]
    fn disposition_routes_needs_human_vs_failed() {
        let needs_human = [
            FailureClassification::MissingMarker,
            FailureClassification::MalformedMarker { detail: "x".into() },
            FailureClassification::AuthRequired {
                provider: AgentProvider::Claude,
            },
            FailureClassification::QuotaExceeded {
                provider: AgentProvider::Claude,
                reset_at: None,
            },
            FailureClassification::Timeout {
                after: Duration::from_secs(1),
            },
            FailureClassification::NoDiff,
            FailureClassification::TestsFailed {
                summary: "x".into(),
            },
            FailureClassification::AgentNonZeroExit {
                exit_code: 1,
                role: "implementer".into(),
            },
            FailureClassification::AgentReported {
                status: StepResultStatus::NeedsHuman,
                summary: "x".into(),
            },
        ];
        for c in needs_human {
            assert_eq!(
                c.disposition(),
                FailureDisposition::NeedsHuman,
                "expected NeedsHuman for {c:?}",
            );
        }

        let failed = [
            FailureClassification::CliMissing {
                binary: "claude".into(),
                install_hint: "x".into(),
            },
            FailureClassification::SpawnError { detail: "x".into() },
            FailureClassification::AgentReported {
                status: StepResultStatus::Failed,
                summary: "x".into(),
            },
        ];
        for c in failed {
            assert_eq!(
                c.disposition(),
                FailureDisposition::Failed,
                "expected Failed for {c:?}",
            );
        }
    }

    #[test]
    fn human_summary_is_non_empty_for_every_variant() {
        let samples = [
            FailureClassification::MissingMarker,
            FailureClassification::MalformedMarker { detail: "x".into() },
            FailureClassification::AgentReported {
                status: StepResultStatus::Failed,
                summary: "x".into(),
            },
            FailureClassification::AuthRequired {
                provider: AgentProvider::Claude,
            },
            FailureClassification::QuotaExceeded {
                provider: AgentProvider::Claude,
                reset_at: Some("3:42pm".into()),
            },
            FailureClassification::CliMissing {
                binary: "claude".into(),
                install_hint: "see README".into(),
            },
            FailureClassification::Timeout {
                after: Duration::from_secs(60),
            },
            FailureClassification::NoDiff,
            FailureClassification::TestsFailed {
                summary: "x".into(),
            },
            FailureClassification::SpawnError { detail: "x".into() },
            FailureClassification::AgentNonZeroExit {
                exit_code: 1,
                role: "r".into(),
            },
        ];
        for c in samples {
            let s = c.human_summary();
            assert!(!s.is_empty(), "empty summary for {c:?}");
        }
    }
}
