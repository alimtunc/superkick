use std::path::PathBuf;
use std::time::Duration;

/// Typed (not `anyhow`) so the lifecycle layer can match on failure modes rather than parse strings.
#[derive(Debug, thiserror::Error)]
pub enum ServerError {
    #[error("superkick-api binary not found at {}; build it first (e.g. `just tauri-dev`)", .path.display())]
    BinaryMissing { path: PathBuf },

    #[error("failed to spawn superkick-api at {}: {source}", .path.display())]
    Spawn {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("failed to remove stale port file {}: {source}", .path.display())]
    StalePortFile {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("port file {} did not appear within {timeout:?}", .path.display())]
    PortFileTimeout { path: PathBuf, timeout: Duration },

    #[error("failed to read port file {}: {source}", .path.display())]
    PortFileRead {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("port file {} held an invalid port: {raw:?}", .path.display())]
    PortFileParse { path: PathBuf, raw: String },

    #[error("failed to terminate superkick-api (pid {pid}): {source}")]
    Shutdown {
        pid: u32,
        #[source]
        source: std::io::Error,
    },
}
