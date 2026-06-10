//! Project configuration loading and validation for Superkick.
//!
//! Parses `superkick.yaml` into strongly-typed Rust structs and validates
//! that the configuration is internally consistent (e.g. agent references
//! resolve, step definitions are well-formed).

mod boot;
mod builtin_agents;
mod model;
mod repo_slug;
mod validate;

pub use boot::{
    DEFAULT_CACHE_DIR, DEFAULT_DATABASE_URL, DEFAULT_PORT, ENV_CACHE_DIR, ENV_CONFIG,
    ENV_DATABASE_URL, ENV_LINEAR_API_KEY, ENV_PORT, ENV_PORT_FILE, port_file_path,
};
pub use model::*;
pub use repo_slug::{detect_repo_slug, parse_repo_slug};
pub use validate::validate;

use std::path::Path;

use anyhow::Context;

/// Default config file name used across the CLI.
pub const CONFIG_FILENAME: &str = "superkick.yaml";

/// Load and validate a Superkick config from a YAML string.
pub fn load_str(yaml: &str) -> anyhow::Result<SuperkickConfig> {
    let config: SuperkickConfig = serde_yaml::from_str(yaml).context("failed to parse config")?;
    validate(&config)?;
    Ok(config)
}

/// Load and validate a Superkick config from a file path.
pub fn load_file(path: &Path) -> anyhow::Result<SuperkickConfig> {
    let contents = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    load_str(&contents)
}

/// `superkick.yaml` is optional: load it when present, otherwise boot from
/// product defaults. Single home for the fallback policy so the server and
/// the CLI can never disagree on it.
pub fn load_or_bootstrap(path: &Path) -> anyhow::Result<SuperkickConfig> {
    if path.exists() {
        load_file(path)
    } else {
        Ok(SuperkickConfig::bootstrap())
    }
}

#[cfg(test)]
mod tests;
