//! Project configuration loading and validation for Superkick.
//!
//! Parses `superkick.yaml` into strongly-typed Rust structs and validates
//! that the configuration is internally consistent (e.g. agent references
//! resolve, step definitions are well-formed).

mod model;
mod validate;

mod repo_slug;

pub use model::*;
pub use repo_slug::parse_repo_slug;
pub use validate::validate;

use std::path::Path;

/// Default config file name used across the CLI.
pub const CONFIG_FILENAME: &str = "superkick.yaml";

/// Load and validate a Superkick config from a YAML string.
pub fn load_str(yaml: &str) -> anyhow::Result<SuperkickConfig> {
    let config: SuperkickConfig =
        serde_yaml::from_str(yaml).map_err(|e| anyhow::anyhow!("failed to parse config: {e}"))?;
    validate(&config)?;
    Ok(config)
}

/// Load and validate a Superkick config from a file path.
pub fn load_file(path: &Path) -> anyhow::Result<SuperkickConfig> {
    let contents = std::fs::read_to_string(path)
        .map_err(|e| anyhow::anyhow!("failed to read {}: {e}", path.display()))?;
    load_str(&contents)
}

#[cfg(test)]
mod tests;
