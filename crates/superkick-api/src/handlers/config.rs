use std::path::PathBuf;

use axum::extract::{FromRef, State};
use axum::response::Json;
use serde::Serialize;

use superkick_config::{RunnerConfig, RunnerPatch};

use crate::AppState;
use crate::error::AppError;

#[derive(Clone)]
pub struct RunnerConfigState {
    pub config_path: PathBuf,
    pub boot_runner: RunnerConfig,
}

impl FromRef<AppState> for RunnerConfigState {
    fn from_ref(state: &AppState) -> Self {
        Self {
            config_path: PathBuf::from(&state.config_path),
            boot_runner: state.boot_runner.clone(),
        }
    }
}

#[derive(Serialize)]
pub struct RunnerConfigResponse {
    worktree_prefix: String,
    base_branch: String,
    setup_commands: Vec<String>,
    requires_restart: bool,
}

fn runner_response(runner: RunnerConfig, boot_runner: &RunnerConfig) -> RunnerConfigResponse {
    RunnerConfigResponse {
        requires_restart: runner != *boot_runner,
        worktree_prefix: runner.worktree_prefix,
        base_branch: runner.base_branch,
        setup_commands: runner.setup_commands,
    }
}

pub async fn get_runner_config(
    State(state): State<RunnerConfigState>,
) -> Result<Json<RunnerConfigResponse>, AppError> {
    let config = superkick_config::load_or_bootstrap(&state.config_path)?;
    Ok(Json(runner_response(config.runner, &state.boot_runner)))
}

pub async fn put_runner_config(
    State(state): State<RunnerConfigState>,
    Json(patch): Json<RunnerPatch>,
) -> Result<Json<RunnerConfigResponse>, AppError> {
    let runner = superkick_config::update_runner_config(&state.config_path, patch)?;
    Ok(Json(runner_response(runner, &state.boot_runner)))
}
