use axum::extract::State;
use axum::response::{IntoResponse, Json};

use crate::AppState;
use crate::error::AppError;

pub async fn get_me(State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    let client = state
        .linear_client
        .as_ref()
        .ok_or_else(|| AppError::ServiceUnavailable("LINEAR_API_KEY not configured"))?;

    let viewer = client.viewer().await?;
    Ok(Json(viewer))
}
