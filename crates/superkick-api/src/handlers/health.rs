use axum::extract::State;
use axum::response::Json;
use serde::Serialize;

use superkick_config::LaunchProfileConfig;

use crate::AppState;

pub async fn health() -> &'static str {
    "ok"
}

#[derive(Serialize)]
pub struct ConfigResponse {
    repo_slug: String,
    base_branch: String,
    launch_profile: LaunchProfileConfig,
}

pub async fn get_config(State(state): State<AppState>) -> Json<ConfigResponse> {
    Json(ConfigResponse {
        repo_slug: state.repo_slug.clone(),
        base_branch: state.base_branch.clone(),
        launch_profile: state.launch_profile.clone(),
    })
}
