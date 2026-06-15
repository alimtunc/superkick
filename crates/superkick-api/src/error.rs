use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};

use superkick_config::RunnerPatchError;
use superkick_core::{AgentProvider, CoreError};
use superkick_integrations::linear::LinearError;
use superkick_runtime::{
    AgentServiceError, AttentionServiceError, ConversationRunnerError, IssuePullRequestError,
    LaunchCompositionError, RetryError, RunServiceError, SnapshotError,
};

#[derive(Debug)]
pub enum AppError {
    Internal(anyhow::Error),
    NotFound(&'static str),
    BadRequest(String),
    /// 409 — the body always includes `error: <message>`, optionally augmented
    /// with structured run-shaped fields when the conflict is about a
    /// duplicate active run. Keeping a single variant means HTTP mapping for
    /// 409 lives in one place; per-handler conflict shapes drift otherwise.
    Conflict {
        message: String,
        run: Option<ConflictRun>,
    },
    /// Structured chat: another turn is already streaming on this conversation.
    /// Maps to 409 with an explicit error code so the UI can render a clear
    /// "wait for the current turn" hint without parsing the message string.
    TurnAlreadyStreaming,
    /// 422 — the request was syntactically valid but the contents failed a
    /// semantic guard. Today this is used by the SUP-148 memory-entry
    /// redaction layer; the body always carries the `error` string.
    Unprocessable(String),
    ServiceUnavailable(&'static str),
}

/// Run-shaped fields attached to a `Conflict` body when the conflict comes
/// from `CoreError::DuplicateActiveRun`. Other conflicts (e.g. invalid
/// orchestrator session transition) leave this `None`.
#[derive(Debug)]
pub struct ConflictRun {
    pub active_run_id: String,
    pub active_run_state: String,
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Internal(err)
    }
}

impl From<LinearError> for AppError {
    /// Map a Linear failure onto the closest user-facing status. 404s
    /// surface as NotFound (the operator can fix by typing a valid
    /// identifier); 5xx / transport errors surface as ServiceUnavailable so
    /// the dashboard can differentiate "bad input" from "Linear is down".
    /// Operator-actionable rejections map to 422 with the message preserved
    /// so the dashboard renders the reason.
    fn from(err: LinearError) -> Self {
        if err.is_not_found() {
            AppError::NotFound("issue not found in Linear")
        } else if err.is_server_error() {
            tracing::warn!(error = %err, "Linear API unavailable");
            AppError::ServiceUnavailable("Linear API unavailable")
        } else if let Some(msg) = err.rejected_message() {
            AppError::Unprocessable(msg.to_string())
        } else {
            AppError::Internal(anyhow::Error::from(err))
        }
    }
}

impl From<RunnerPatchError> for AppError {
    fn from(err: RunnerPatchError) -> Self {
        match err {
            RunnerPatchError::Invalid(msg) => AppError::Unprocessable(msg),
            RunnerPatchError::Other(e) => AppError::Internal(e),
        }
    }
}

impl From<RetryError> for AppError {
    fn from(err: RetryError) -> Self {
        match err {
            RetryError::NotFound(_) => AppError::NotFound("launch task not found"),
            RetryError::Core(e) => AppError::from(e),
            RetryError::Other(e) => AppError::Internal(e),
        }
    }
}

impl From<SnapshotError> for AppError {
    fn from(err: SnapshotError) -> Self {
        match err {
            SnapshotError::LaunchTaskNotFound(_) => AppError::NotFound("launch task not found"),
            SnapshotError::Storage(e) => AppError::Internal(e),
        }
    }
}

impl From<RunServiceError> for AppError {
    fn from(err: RunServiceError) -> Self {
        match err {
            // Preserves the DuplicateActiveRun 409 ConflictRun shape and the
            // InvalidTransition 409 shape via the existing CoreError mapping.
            RunServiceError::Conflict(e) => AppError::from(e),
            RunServiceError::Internal(e) => AppError::Internal(e),
        }
    }
}

impl From<AttentionServiceError> for AppError {
    fn from(err: AttentionServiceError) -> Self {
        match err {
            AttentionServiceError::RunNotFound => AppError::NotFound("run not found"),
            AttentionServiceError::RequestNotFound => {
                AppError::NotFound("attention request not found")
            }
            AttentionServiceError::WrongRun(_) | AttentionServiceError::RunTerminal(_) => {
                AppError::BadRequest(err.to_string())
            }
            AttentionServiceError::Core(e) => AppError::from(e),
            AttentionServiceError::Storage(e) => AppError::Internal(e),
        }
    }
}

impl From<ConversationRunnerError> for AppError {
    fn from(err: ConversationRunnerError) -> Self {
        match err {
            ConversationRunnerError::ConversationNotFound(_) => {
                AppError::NotFound("conversation not found")
            }
            ConversationRunnerError::RunNotFound(_) => AppError::NotFound("run not found"),
            ConversationRunnerError::TurnNotFound(_) => AppError::NotFound("turn not found"),
            ConversationRunnerError::TurnAlreadyStreaming(_) => AppError::TurnAlreadyStreaming,
            ConversationRunnerError::NoActiveTurn(_) => AppError::Conflict {
                message: "no active protocol turn to force-takeover".to_string(),
                run: None,
            },
            ConversationRunnerError::ProviderUnavailable(provider) => {
                AppError::ServiceUnavailable(match provider {
                    AgentProvider::Claude => "claude provider unavailable",
                    AgentProvider::Codex => "codex provider unavailable",
                })
            }
            ConversationRunnerError::Storage(inner) => AppError::Internal(inner),
        }
    }
}

impl From<LaunchCompositionError> for AppError {
    fn from(err: LaunchCompositionError) -> Self {
        match err {
            LaunchCompositionError::ProfileNotFound(_) => {
                AppError::NotFound("launch profile not found")
            }
            other @ (LaunchCompositionError::IncompatibleStep { .. }
            | LaunchCompositionError::UnsupportedExecutor { .. }) => {
                AppError::Unprocessable(other.to_string())
            }
            LaunchCompositionError::Core(e) => AppError::from(e),
            LaunchCompositionError::Storage(e) => AppError::Internal(e),
        }
    }
}

impl From<IssuePullRequestError> for AppError {
    fn from(err: IssuePullRequestError) -> Self {
        match err {
            IssuePullRequestError::PullRequestNotFound => {
                AppError::NotFound("pull request not found for issue")
            }
            IssuePullRequestError::MissingHeadSha => {
                AppError::Unprocessable("pull request metadata unavailable".into())
            }
            IssuePullRequestError::Storage(e) => AppError::Internal(e),
            IssuePullRequestError::GitHub(e) => {
                tracing::warn!(error = %e, "GitHub API unavailable");
                AppError::ServiceUnavailable("GitHub API unavailable")
            }
        }
    }
}

impl From<AgentServiceError> for AppError {
    fn from(err: AgentServiceError) -> Self {
        match err {
            AgentServiceError::NotFound => AppError::NotFound("agent not found"),
            AgentServiceError::Conflict(name) => AppError::Conflict {
                message: format!("agent '{name}' already exists"),
                run: None,
            },
            AgentServiceError::BuiltinUndeletable => AppError::BadRequest(
                "builtin agents cannot be deleted — disable them instead".into(),
            ),
            AgentServiceError::Invalid(e) => AppError::from(e),
            AgentServiceError::Db(e) => AppError::Internal(e),
        }
    }
}

impl From<CoreError> for AppError {
    fn from(err: CoreError) -> Self {
        match err {
            CoreError::InvalidInput(msg) => AppError::BadRequest(msg),
            CoreError::TerminalState(state) => {
                AppError::BadRequest(format!("run is in terminal state: {state}"))
            }
            CoreError::DuplicateActiveRun {
                ref issue_identifier,
                ref active_run_id,
                ref state,
            } => AppError::Conflict {
                message: format!("issue {issue_identifier} already has an active run ({state})"),
                run: Some(ConflictRun {
                    active_run_id: active_run_id.0.to_string(),
                    active_run_state: state.to_string(),
                }),
            },
            CoreError::InvalidTransition { from, to } => AppError::Conflict {
                message: format!("invalid state transition: {from} -> {to}"),
                run: None,
            },
            CoreError::InvalidOrchestratorTransition { from, to } => AppError::Conflict {
                message: format!("invalid orchestrator session transition: {from} -> {to}"),
                run: None,
            },
            CoreError::InvalidLaunchTaskTransition { from, to } => AppError::Conflict {
                message: format!("invalid launch task transition: {from} -> {to}"),
                run: None,
            },
            CoreError::InvalidLaunchTaskStepTransition { from, to } => AppError::Conflict {
                message: format!("invalid launch task step transition: {from} -> {to}"),
                run: None,
            },
            CoreError::InvalidHandoffTransition { from, to } => AppError::Conflict {
                message: format!("invalid handoff transition: {from} -> {to}"),
                run: None,
            },
            CoreError::CredentialLikely { kind } => AppError::Unprocessable(format!(
                "redacted credential-like content matched pattern: {kind}"
            )),
            CoreError::InterruptAnswerSerialization(err) => {
                AppError::Internal(anyhow::Error::from(err))
            }
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        match self {
            AppError::Internal(err) => {
                tracing::error!(error = %err, "internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": err.to_string() })),
                )
                    .into_response()
            }
            AppError::NotFound(msg) => (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": msg })),
            )
                .into_response(),
            AppError::BadRequest(msg) => (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": msg })),
            )
                .into_response(),
            AppError::Conflict { message, run } => {
                let mut body = serde_json::json!({ "error": message });
                if let Some(run) = run {
                    body["active_run_id"] = serde_json::json!(run.active_run_id);
                    body["active_run_state"] = serde_json::json!(run.active_run_state);
                }
                (StatusCode::CONFLICT, Json(body)).into_response()
            }
            AppError::TurnAlreadyStreaming => (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "another turn is already streaming on this conversation",
                    "code": "turn_already_streaming",
                })),
            )
                .into_response(),
            AppError::Unprocessable(msg) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(serde_json::json!({ "error": msg })),
            )
                .into_response(),
            AppError::ServiceUnavailable(msg) => (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "error": msg })),
            )
                .into_response(),
        }
    }
}
