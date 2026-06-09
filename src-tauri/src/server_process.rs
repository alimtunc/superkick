use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::{Duration, Instant};

use crate::error::ServerError;

const POLL_INTERVAL: Duration = Duration::from_millis(50);
const SHUTDOWN_GRACE: Duration = Duration::from_secs(5);

/// How to launch the existing `superkick-api` binary for one project.
pub struct SpawnConfig {
    pub binary: PathBuf,
    pub project_root: PathBuf,
    pub config_path: String,
    pub database_url: String,
    pub cache_dir: String,
    pub start_port: u16,
}

/// A running `superkick-api` child plus the port file to clean up on shutdown.
pub struct ServerProcess {
    child: Child,
    port_file: PathBuf,
}

impl ServerProcess {
    /// Launches the child and returns immediately — the caller discovers the bound port via
    /// [`wait_for_port_file`] on [`ServerProcess::port_file`], so the child is killable during the wait.
    pub fn spawn(config: SpawnConfig) -> Result<Self, ServerError> {
        let SpawnConfig {
            binary,
            project_root,
            config_path,
            database_url,
            cache_dir,
            start_port,
        } = config;

        if !binary.exists() {
            return Err(ServerError::BinaryMissing { path: binary });
        }

        let port_file = port_file_path(&project_root, &config_path);
        remove_stale_port_file(&port_file)?;

        let child = Command::new(&binary)
            .current_dir(&project_root)
            .env("SUPERKICK_CONFIG", &config_path)
            .env("DATABASE_URL", &database_url)
            .env("SUPERKICK_CACHE_DIR", &cache_dir)
            .env("PORT", start_port.to_string())
            .spawn()
            .map_err(|source| ServerError::Spawn {
                path: binary,
                source,
            })?;

        Ok(Self { child, port_file })
    }

    #[must_use]
    pub fn port_file(&self) -> &Path {
        &self.port_file
    }

    /// Synchronous: runs from Tauri's `RunEvent::Exit` handler, where awaiting would re-enter the runtime.
    pub fn shutdown(mut self) -> Result<(), ServerError> {
        let pid = self.child.id();
        request_termination(pid);

        let deadline = Instant::now() + SHUTDOWN_GRACE;
        let outcome = loop {
            match self.child.try_wait() {
                Ok(Some(_status)) => break Ok(()),
                Ok(None) if Instant::now() >= deadline => break force_kill(&mut self.child, pid),
                Ok(None) => std::thread::sleep(POLL_INTERVAL),
                Err(source) => break Err(ServerError::Shutdown { pid, source }),
            }
        };

        let _ = std::fs::remove_file(&self.port_file);
        outcome
    }
}

fn force_kill(child: &mut Child, pid: u32) -> Result<(), ServerError> {
    let result = child
        .kill()
        .map_err(|source| ServerError::Shutdown { pid, source });
    let _ = child.wait();
    result
}

#[cfg(unix)]
fn request_termination(pid: u32) {
    // SAFETY: kill(2) with a real pid and SIGTERM is sound; delivery is best-effort.
    unsafe {
        libc::kill(pid as libc::pid_t, libc::SIGTERM);
    }
}

#[cfg(not(unix))]
fn request_termination(_pid: u32) {}

/// Where the spawned server writes `.superkick-port`, mirroring `superkick-api`'s own logic
/// (config dir's parent, resolved against the child's cwd = `project_root`).
#[must_use]
pub fn port_file_path(project_root: &Path, config_path: &str) -> PathBuf {
    match Path::new(config_path).parent() {
        Some(parent) if !parent.as_os_str().is_empty() => {
            project_root.join(parent).join(".superkick-port")
        }
        _ => project_root.join(".superkick-port"),
    }
}

pub fn remove_stale_port_file(path: &Path) -> Result<(), ServerError> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(source) => Err(ServerError::StalePortFile {
            path: path.to_path_buf(),
            source,
        }),
    }
}

pub fn wait_for_port_file(path: &Path, timeout: Duration) -> Result<u16, ServerError> {
    let deadline = Instant::now() + timeout;
    loop {
        if path.exists() {
            if let Ok(port) = read_port_file(path) {
                return Ok(port);
            }
        }
        if Instant::now() >= deadline {
            return if path.exists() {
                read_port_file(path)
            } else {
                Err(ServerError::PortFileTimeout {
                    path: path.to_path_buf(),
                    timeout,
                })
            };
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

pub fn read_port_file(path: &Path) -> Result<u16, ServerError> {
    let raw = std::fs::read_to_string(path).map_err(|source| ServerError::PortFileRead {
        path: path.to_path_buf(),
        source,
    })?;
    raw.trim()
        .parse::<u16>()
        .map_err(|_| ServerError::PortFileParse {
            path: path.to_path_buf(),
            raw: raw.trim().to_string(),
        })
}
