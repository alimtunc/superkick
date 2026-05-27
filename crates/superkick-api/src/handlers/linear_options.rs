//! `GET /linear/options` — picker metadata (teams + workflow states,
//! active users, projects, labels) in one round-trip.

use axum::extract::State;
use axum::response::Json;
use superkick_integrations::linear::LinearOptions;

use crate::error::AppError;
use crate::handlers::issues::{IssueWritesState, require_writer};

pub async fn get_options(
    State(state): State<IssueWritesState>,
) -> Result<Json<LinearOptions>, AppError> {
    let writer = require_writer(&state)?;
    let options = writer.list_options().await?;
    Ok(Json(options))
}
