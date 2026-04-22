//! Structured error type for Linear GraphQL calls.
//!
//! Callers that map Linear failures onto user-facing status codes (notably
//! the `/launch-queue/.../dispatch` handler) need to tell a 404 from a
//! transient 5xx. Returning a plain `anyhow::Error` collapses those cases
//! and forces every handler to heuristically grep error strings; this enum
//! keeps the distinction explicit.

use thiserror::Error;

/// Failure shape of a Linear GraphQL call. `is_not_found` / `is_server_error`
/// are the classifiers handlers use to pick the correct `AppError` variant.
#[derive(Debug, Error)]
pub enum LinearError {
    /// HTTP-layer failure (timeout, TLS, DNS). Treat as retryable / 5xx.
    #[error("failed to reach Linear API: {0}")]
    Transport(#[from] reqwest::Error),

    /// Linear returned a non-2xx status. `status.is_server_error()` is the
    /// signal for "Linear is down", other statuses map to `NotFound` (404)
    /// or `BadGateway` depending on range.
    #[error("Linear API returned {status}: {body}")]
    Status {
        status: reqwest::StatusCode,
        body: String,
    },

    /// GraphQL call succeeded at the HTTP layer but Linear reported an
    /// application-level error payload.
    #[error("Linear GraphQL error: {0}")]
    Graphql(String),

    /// GraphQL call returned a 2xx response with no `data` field — Linear
    /// uses this shape for not-found issues.
    #[error("Linear response contained no data")]
    NoData,

    /// Response body did not deserialize as the expected GraphQL envelope.
    #[error("invalid Linear response: {0}")]
    InvalidResponse(String),
}

impl LinearError {
    /// Did Linear report the requested entity as missing? Maps to HTTP 404.
    #[must_use]
    pub fn is_not_found(&self) -> bool {
        match self {
            LinearError::Status { status, .. } => *status == reqwest::StatusCode::NOT_FOUND,
            LinearError::NoData => true,
            _ => false,
        }
    }

    /// Is this a server-side / transport failure the operator cannot fix by
    /// retrying the same identifier? Maps to HTTP 502 / 503.
    #[must_use]
    pub fn is_server_error(&self) -> bool {
        match self {
            LinearError::Transport(_) => true,
            LinearError::Status { status, .. } => status.is_server_error(),
            _ => false,
        }
    }
}
