use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};

use superkick_core::CoreError;
use superkick_integrations::linear::LinearError;

#[derive(Debug)]
pub enum AppError {
    Internal(anyhow::Error),
    NotFound(&'static str),
    BadRequest(String),
    Conflict {
        message: String,
        active_run_id: String,
        active_run_state: String,
    },
    ServiceUnavailable(&'static str),
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
    fn from(err: LinearError) -> Self {
        if err.is_not_found() {
            AppError::NotFound("issue not found in Linear")
        } else if err.is_server_error() {
            tracing::warn!(error = %err, "Linear API unavailable");
            AppError::ServiceUnavailable("Linear API unavailable")
        } else {
            AppError::Internal(anyhow::Error::from(err))
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
                active_run_id: active_run_id.0.to_string(),
                active_run_state: state.to_string(),
            },
            other => AppError::Internal(other.into()),
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
            AppError::Conflict {
                message,
                active_run_id,
                active_run_state,
            } => (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": message,
                    "active_run_id": active_run_id,
                    "active_run_state": active_run_state,
                })),
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
