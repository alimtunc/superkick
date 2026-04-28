use axum::extract::State;
use axum::response::Json;
use serde::Serialize;
use superkick_core::RuntimeWithProviders;

use crate::AppState;
use crate::error::AppError;

#[derive(Serialize)]
pub struct RuntimesResponse {
    pub runtimes: Vec<RuntimeWithProviders>,
}

/// `GET /runtimes` — return the cached registry without re-running detection.
/// Detection happens at boot and on `POST /runtimes/refresh`; this endpoint is
/// pure-read so the dashboard can poll cheaply.
pub async fn list_runtimes(
    State(state): State<AppState>,
) -> Result<Json<RuntimesResponse>, AppError> {
    let runtimes = state
        .runtime_detector
        .read_snapshot()
        .await
        .map_err(AppError::Internal)?;
    Ok(Json(RuntimesResponse { runtimes }))
}

/// `POST /runtimes/refresh` — re-run local detection and return the full
/// registry snapshot. Returns 503 if another refresh is already in flight so an
/// impatient operator clicking twice gets a clear signal rather than queueing
/// duplicate work behind the mutex.
pub async fn refresh_runtimes(
    State(state): State<AppState>,
) -> Result<Json<RuntimesResponse>, AppError> {
    match state
        .runtime_detector
        .try_detect_local()
        .await
        .map_err(AppError::Internal)?
    {
        Some(_) => {
            let runtimes = state
                .runtime_detector
                .read_snapshot()
                .await
                .map_err(AppError::Internal)?;
            Ok(Json(RuntimesResponse { runtimes }))
        }
        None => Err(AppError::ServiceUnavailable("runtime detector busy")),
    }
}
