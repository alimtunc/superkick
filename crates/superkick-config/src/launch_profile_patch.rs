use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::model::LaunchProfileConfig;
use crate::{load_or_bootstrap, save_file};

/// Operator-editable subset of [`LaunchProfileConfig`], applied through
/// [`update_launch_profile_config`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LaunchProfilePatch {
    pub auto_transition_in_progress: bool,
}

/// Load the config at `path` (bootstrapping defaults when the file is
/// missing), apply the patch to its `launch_profile` section, persist
/// atomically, and return the updated launch-profile section.
pub fn update_launch_profile_config(
    path: &Path,
    patch: LaunchProfilePatch,
) -> anyhow::Result<LaunchProfileConfig> {
    let mut config = load_or_bootstrap(path)?;
    config.launch_profile.auto_transition_in_progress = patch.auto_transition_in_progress;
    save_file(&config, path)?;
    Ok(config.launch_profile)
}
