//! Cross-process boot contract shared by the API binary, the CLI, and the
//! desktop shell: env-var names, defaults, and the port-file location. One
//! home so the writer (superkick-api) and its readers can never drift.
//!
//! `SUPERKICK_PORT_FILE`, when set, makes the server write its bound port to
//! that exact path instead of next to the config file.

use std::path::{Path, PathBuf};

pub const ENV_CONFIG: &str = "SUPERKICK_CONFIG";
pub const ENV_DATABASE_URL: &str = "DATABASE_URL";
pub const ENV_CACHE_DIR: &str = "SUPERKICK_CACHE_DIR";
pub const ENV_PORT: &str = "PORT";
pub const ENV_PORT_FILE: &str = "SUPERKICK_PORT_FILE";
pub const ENV_LINEAR_API_KEY: &str = "LINEAR_API_KEY";

pub const DEFAULT_DATABASE_URL: &str = "sqlite:superkick.db";
pub const DEFAULT_CACHE_DIR: &str = ".superkick-cache";
pub const DEFAULT_PORT: u16 = 3100;

/// Where the server writes its bound port for discovery: `.superkick-port`
/// next to the config file (relative paths resolve against the server's cwd).
#[must_use]
pub fn port_file_path(config_path: &str) -> PathBuf {
    Path::new(config_path)
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or(Path::new("."))
        .join(".superkick-port")
}
