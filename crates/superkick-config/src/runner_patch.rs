use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::model::RunnerConfig;
use crate::{load_or_bootstrap, save_file};

/// Operator-editable subset of [`RunnerConfig`], applied through
/// [`update_runner_config`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunnerPatch {
    pub worktree_prefix: String,
    pub base_branch: String,
    pub setup_commands: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum RunnerPatchError {
    #[error("{0}")]
    Invalid(String),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

const WORKTREE_PREFIX_MAX_CHARS: usize = 40;

/// Load the config at `path` (bootstrapping defaults when the file is
/// missing), apply the normalized patch to its `runner` section, persist
/// atomically, and return the updated runner section.
pub fn update_runner_config(
    path: &Path,
    patch: RunnerPatch,
) -> Result<RunnerConfig, RunnerPatchError> {
    let mut config = load_or_bootstrap(path)?;
    let patch = normalize(patch);
    validate_patch(&patch)?;
    config.runner.worktree_prefix = patch.worktree_prefix;
    config.runner.base_branch = patch.base_branch;
    config.runner.setup_commands = patch.setup_commands;
    save_file(&config, path)?;
    Ok(config.runner)
}

fn normalize(patch: RunnerPatch) -> RunnerPatch {
    RunnerPatch {
        worktree_prefix: patch.worktree_prefix.trim().to_string(),
        base_branch: patch.base_branch.trim().to_string(),
        setup_commands: patch
            .setup_commands
            .into_iter()
            .map(|command| command.trim().to_string())
            .filter(|command| !command.is_empty())
            .collect(),
    }
}

fn validate_patch(patch: &RunnerPatch) -> Result<(), RunnerPatchError> {
    validate_worktree_prefix(&patch.worktree_prefix)?;
    if patch.base_branch.is_empty() {
        return Err(invalid("base_branch must not be empty"));
    }
    Ok(())
}

fn validate_worktree_prefix(prefix: &str) -> Result<(), RunnerPatchError> {
    if prefix.is_empty() {
        return Err(invalid("worktree_prefix must not be empty"));
    }
    if prefix.chars().count() > WORKTREE_PREFIX_MAX_CHARS {
        return Err(invalid(&format!(
            "worktree_prefix must be at most {WORKTREE_PREFIX_MAX_CHARS} characters"
        )));
    }
    if !prefix.chars().all(is_worktree_prefix_char) {
        return Err(invalid(
            "worktree_prefix may only contain lowercase letters, digits, '.', '_' and '-'",
        ));
    }
    if prefix.starts_with(['.', '-']) || prefix.ends_with(['.', '-']) {
        return Err(invalid(
            "worktree_prefix must not start or end with '.' or '-'",
        ));
    }
    Ok(())
}

fn is_worktree_prefix_char(c: char) -> bool {
    c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-')
}

fn invalid(message: &str) -> RunnerPatchError {
    RunnerPatchError::Invalid(message.to_string())
}
