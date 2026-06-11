use std::path::{Path, PathBuf};

use crate::error::ServerError;
use crate::registry::Project;
use crate::server_process::SpawnConfig;

/// Per-project runtime data layout under the desktop app data dir: every
/// project gets an isolated db, cache, and port file, and the selected repo
/// stays untouched.
pub struct ProjectDataPaths {
    pub db_url: String,
    pub cache_dir: PathBuf,
    pub port_file: PathBuf,
}

#[must_use]
pub fn project_data_paths(data_root: &Path, project_id: &str) -> ProjectDataPaths {
    let project_dir = data_root.join(project_id);
    ProjectDataPaths {
        db_url: format!("sqlite:{}", project_dir.join("superkick.db").display()),
        cache_dir: project_dir.join("cache"),
        port_file: project_dir.join(".superkick-port"),
    }
}

/// The desktop-set env vars win over the project's `.env` (dotenvy never
/// overrides set vars), so two projects can never collide on one database.
pub(crate) fn spawn_config(
    data_root: &Path,
    project: &Project,
) -> Result<SpawnConfig, ServerError> {
    let paths = project_data_paths(data_root, &project.id);
    std::fs::create_dir_all(&paths.cache_dir).map_err(|source| ServerError::DataDir {
        path: paths.cache_dir.clone(),
        source,
    })?;
    Ok(SpawnConfig {
        binary: api_binary_path(),
        project_root: project.path.clone(),
        config_path: std::env::var(superkick_config::ENV_CONFIG)
            .unwrap_or_else(|_| superkick_config::CONFIG_FILENAME.into()),
        database_url: paths.db_url,
        cache_dir: paths.cache_dir.display().to_string(),
        port_file: paths.port_file,
        start_port: std::env::var(superkick_config::ENV_PORT)
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(superkick_config::DEFAULT_PORT),
        linear_api_key: project.linear_api_key.clone(),
    })
}

/// The bundler places the `externalBin` sidecar next to the shell executable,
/// and a dev `cargo run` shares `target/debug` with the api binary — so
/// exe-adjacent covers both. The workspace fallback handles a release shell
/// run against a debug api build.
fn api_binary_path() -> PathBuf {
    let name = api_binary_name();
    if let Ok(exe) = std::env::current_exe()
        && let Some(dir) = exe.parent()
    {
        let adjacent = dir.join(name);
        if adjacent.exists() {
            return adjacent;
        }
    }
    workspace_root().join("target").join("debug").join(name)
}

fn workspace_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn api_binary_name() -> &'static str {
    if cfg!(windows) {
        "superkick-api.exe"
    } else {
        "superkick-api"
    }
}
