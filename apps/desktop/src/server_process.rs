use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::error::ServerError;

const POLL_INTERVAL: Duration = Duration::from_millis(50);
const SHUTDOWN_GRACE: Duration = Duration::from_secs(5);
const LOG_TAIL_CAPACITY: usize = 100;

/// How to launch the existing `superkick-api` binary for one project.
pub struct SpawnConfig {
    pub binary: PathBuf,
    pub project_root: PathBuf,
    pub config_path: String,
    pub database_url: String,
    pub cache_dir: String,
    pub port_file: PathBuf,
    pub start_port: u16,
    pub linear_api_key: Option<String>,
}

/// A running `superkick-api` child plus the port file to clean up on shutdown.
pub struct ServerProcess {
    child: Child,
    port_file: PathBuf,
    log_tail: Arc<Mutex<VecDeque<String>>>,
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
            port_file,
            start_port,
            linear_api_key,
        } = config;

        if !binary.exists() {
            return Err(ServerError::BinaryMissing { path: binary });
        }

        remove_stale_port_file(&port_file)?;

        let mut command = Command::new(&binary);
        command
            .current_dir(&project_root)
            .env(superkick_config::ENV_CONFIG, &config_path)
            .env(superkick_config::ENV_DATABASE_URL, &database_url)
            .env(superkick_config::ENV_CACHE_DIR, &cache_dir)
            .env(superkick_config::ENV_PORT_FILE, &port_file)
            .env(superkick_config::ENV_PORT, start_port.to_string())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(key) = &linear_api_key {
            command.env(superkick_config::ENV_LINEAR_API_KEY, key);
        }
        reset_signal_mask(&mut command);
        let mut child = command.spawn().map_err(|source| ServerError::Spawn {
            path: binary,
            source,
        })?;

        let log_tail = Arc::new(Mutex::new(VecDeque::with_capacity(LOG_TAIL_CAPACITY)));
        capture_output(child.stdout.take(), child.stderr.take(), &log_tail);

        Ok(Self {
            child,
            port_file,
            log_tail,
        })
    }

    #[must_use]
    pub fn port_file(&self) -> &Path {
        &self.port_file
    }

    /// Last captured stdout/stderr lines, oldest first. Used to surface boot
    /// failures in the desktop boot state.
    #[must_use]
    pub fn log_tail(&self) -> Vec<String> {
        self.log_tail
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .iter()
            .cloned()
            .collect()
    }

    /// Non-blocking liveness probe: `true` once the child has exited.
    pub fn exited(&mut self) -> Result<bool, ServerError> {
        let pid = self.child.id();
        self.child
            .try_wait()
            .map(|status| status.is_some())
            .map_err(|source| ServerError::Liveness { pid, source })
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

/// Reader threads keep the last [`LOG_TAIL_CAPACITY`] lines and re-emit each
/// line through `tracing` so the desktop console still shows server output.
fn capture_output(
    stdout: Option<ChildStdout>,
    stderr: Option<ChildStderr>,
    log_tail: &Arc<Mutex<VecDeque<String>>>,
) {
    if let Some(stdout) = stdout {
        spawn_line_reader(BufReader::new(stdout), Arc::clone(log_tail));
    }
    if let Some(stderr) = stderr {
        spawn_line_reader(BufReader::new(stderr), Arc::clone(log_tail));
    }
}

fn spawn_line_reader<R: BufRead + Send + 'static>(
    reader: R,
    log_tail: Arc<Mutex<VecDeque<String>>>,
) {
    std::thread::spawn(move || {
        for line in reader.lines() {
            let Ok(line) = line else { break };
            tracing::info!(target: "superkick_api", "{line}");
            let mut tail = log_tail
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if tail.len() == LOG_TAIL_CAPACITY {
                tail.pop_front();
            }
            tail.push_back(line);
        }
    });
}

fn force_kill(child: &mut Child, pid: u32) -> Result<(), ServerError> {
    let result = child
        .kill()
        .map_err(|source| ServerError::Shutdown { pid, source });
    let _ = child.wait();
    result
}

/// The shell blocks SIGTERM/SIGINT for its signal listener; the child must
/// not inherit that mask or graceful termination would never reach it.
#[cfg(unix)]
fn reset_signal_mask(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    // SAFETY: pre_exec runs between fork and exec; sigprocmask is async-signal-safe.
    unsafe {
        command.pre_exec(|| {
            let mut set: libc::sigset_t = std::mem::zeroed();
            libc::sigemptyset(&mut set);
            libc::sigprocmask(libc::SIG_SETMASK, &set, std::ptr::null_mut());
            Ok(())
        });
    }
}

#[cfg(not(unix))]
fn reset_signal_mask(_command: &mut Command) {}

#[cfg(unix)]
fn request_termination(pid: u32) {
    // SAFETY: kill(2) with a real pid and SIGTERM is sound; delivery is best-effort.
    unsafe {
        libc::kill(pid as libc::pid_t, libc::SIGTERM);
    }
}

#[cfg(not(unix))]
fn request_termination(_pid: u32) {}

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
