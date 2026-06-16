use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use tauri::{Emitter, Manager};

use crate::lifecycle::{BootMachine, BootPhase, server_url};
use crate::registry::{Project, ProjectRegistry, RegistryError};
use crate::server_process::{ServerProcess, wait_for_port_file};
use crate::spawn::spawn_config;
use crate::webview::{navigate_url, navigate_with_return_path};

const BOOT_EVENT: &str = "superkick://boot";
const PORT_FILE_TIMEOUT: Duration = Duration::from_secs(30);
const CRASH_POLL_INTERVAL: Duration = Duration::from_secs(1);

/// Owns the project registry, the boot state machine, and the single active
/// server process. Commands mutate the registry synchronously; boot/stop work
/// runs on dedicated threads and reports back through `superkick://boot`
/// events plus webview navigation.
pub struct Supervisor {
    registry: Mutex<ProjectRegistry>,
    registry_path: PathBuf,
    data_root: PathBuf,
    machine: Mutex<BootMachine>,
    server: Mutex<Option<ServerProcess>>,
    shutting_down: AtomicBool,
    /// Incremented on every switch; boot threads carry their epoch and discard
    /// their result when a newer switch has happened underneath them.
    epoch: AtomicU64,
    home_url: tauri::Url,
}

impl Supervisor {
    pub fn new(
        registry: ProjectRegistry,
        registry_path: PathBuf,
        data_root: PathBuf,
        home_url: tauri::Url,
    ) -> Self {
        Self {
            registry: Mutex::new(registry),
            registry_path,
            data_root,
            machine: Mutex::new(BootMachine::default()),
            server: Mutex::new(None),
            shutting_down: AtomicBool::new(false),
            epoch: AtomicU64::new(0),
            home_url,
        }
    }

    pub fn registry_snapshot(&self) -> ProjectRegistry {
        lock(&self.registry).clone()
    }

    pub fn boot_phase(&self) -> BootPhase {
        lock(&self.machine).phase().clone()
    }

    pub fn add_project(&self, path: &Path) -> Result<Project, RegistryError> {
        let mut registry = lock(&self.registry);
        let project = registry.add(path)?;
        registry.save(&self.registry_path)?;
        Ok(project)
    }

    pub fn remove_project(&self, id: &str) -> Result<(), RegistryError> {
        let mut registry = lock(&self.registry);
        registry.remove(id)?;
        registry.save(&self.registry_path)
    }

    /// Selects a project and boots its server. Re-selecting the project that
    /// is already running just brings the dashboard back — no restart.
    pub fn select_project(
        &self,
        handle: &tauri::AppHandle,
        id: &str,
        return_path: Option<String>,
    ) -> Result<(), RegistryError> {
        let project = {
            let mut registry = lock(&self.registry);
            let project = registry.select(id, chrono::Utc::now())?;
            registry.save(&self.registry_path)?;
            project
        };

        if let BootPhase::Running { project_id, port } = self.boot_phase()
            && project_id == project.id
        {
            navigate_with_return_path(handle, &server_url(port), return_path);
            return Ok(());
        }

        self.boot(handle, project, return_path);
        Ok(())
    }

    /// Sets or clears a project's Linear key. The key reaches the server via
    /// its environment, so applying it to the active project needs a restart.
    pub fn configure_project(
        &self,
        handle: &tauri::AppHandle,
        id: &str,
        linear_api_key: Option<String>,
        return_path: Option<String>,
    ) -> Result<(), RegistryError> {
        let (project, is_active) = {
            let mut registry = lock(&self.registry);
            let project = registry.set_linear_api_key(id, linear_api_key)?;
            registry.save(&self.registry_path)?;
            let is_active = registry.active_id.as_deref() == Some(id);
            (project, is_active)
        };
        if is_active {
            self.boot(handle, project, return_path);
        }
        Ok(())
    }

    pub fn report_attention(&self, id: &str, count: u32) -> Result<(), RegistryError> {
        let mut registry = lock(&self.registry);
        if registry.set_attention_count(id, count)? {
            registry.save(&self.registry_path)?;
        }
        Ok(())
    }

    /// Re-runs the boot for the active project after a failure.
    pub fn retry_boot(&self, handle: &tauri::AppHandle) {
        if let Some(project) = lock(&self.registry).active().cloned() {
            self.boot(handle, project, None);
        }
    }

    /// Reboots the active project's server unconditionally, e.g. after a
    /// config change that only takes effect at server startup.
    pub fn restart_active_project(&self, handle: &tauri::AppHandle, return_path: Option<String>) {
        if let Some(project) = lock(&self.registry).active().cloned() {
            self.boot(handle, project, return_path);
        }
    }

    /// Boots the persisted active project on app launch, if any.
    pub fn boot_persisted_active(&self, handle: &tauri::AppHandle) {
        if let Some(project) = lock(&self.registry).active().cloned() {
            self.boot(handle, project, None);
        }
    }

    /// Returns the webview to the app-bundled picker page.
    pub fn go_home(&self, handle: &tauri::AppHandle) {
        navigate_url(handle, self.home_url.clone());
    }

    /// App exit: stop the child before the process dies so it is never orphaned.
    pub fn stop_all(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
        self.epoch.fetch_add(1, Ordering::SeqCst);
        if let Some(server) = lock(&self.server).take() {
            shutdown_server(server);
        }
    }

    fn boot(&self, handle: &tauri::AppHandle, project: Project, return_path: Option<String>) {
        let epoch = self.epoch.fetch_add(1, Ordering::SeqCst) + 1;
        let handle = handle.clone();
        std::thread::spawn(move || {
            let Some(state) = handle.try_state::<Supervisor>() else {
                tracing::error!("supervisor state was not registered");
                return;
            };
            state.run_boot(&handle, project, epoch, return_path);
        });
    }

    /// One full boot attempt on a worker thread: stop the previous server,
    /// spawn the new one, wait for its port, then watch it for crashes. The
    /// webview stays where it is until the new server answers — a local
    /// overlay covers the wait, and only a failure routes to the picker.
    fn run_boot(
        &self,
        handle: &tauri::AppHandle,
        project: Project,
        epoch: u64,
        return_path: Option<String>,
    ) {
        // A stale thread must never touch the server slot — it could reap a
        // newer boot's child and leave the machine Running over a dead server.
        let previous = {
            let mut guard = lock(&self.server);
            if self.is_stale(epoch) {
                return;
            }
            guard.take()
        };
        if let Some(previous) = previous {
            shutdown_server(previous);
        }
        if !lock(&self.machine).start(project.id.clone(), epoch) {
            return;
        }
        self.emit_phase(handle);

        let server = match spawn_config(&self.data_root, &project).and_then(ServerProcess::spawn) {
            Ok(server) => server,
            Err(err) => {
                self.fail(handle, &project.id, epoch, err.to_string(), Vec::new());
                return;
            }
        };
        let port_file = server.port_file().to_path_buf();

        // Register before the (slow) port wait so a quit mid-boot tears the child down.
        if let Some(orphan) = self.store_server(server, epoch) {
            shutdown_server(orphan);
            return;
        }

        match wait_for_port_file(&port_file, PORT_FILE_TIMEOUT) {
            Ok(port) => {
                if !lock(&self.machine).mark_running(&project.id, epoch, port) {
                    return;
                }
                self.emit_phase(handle);
                navigate_with_return_path(handle, &server_url(port), return_path);
                self.watch_for_crash(handle, &project.id, epoch);
            }
            Err(err) => {
                let tail = self.reap_server_tail(epoch).unwrap_or_default();
                self.fail(handle, &project.id, epoch, err.to_string(), tail);
            }
        }
    }

    /// Polls the child until it exits, the app shuts down, or a newer switch
    /// supersedes this boot. An unexpected exit surfaces as `Failed` and the
    /// webview returns to the picker.
    fn watch_for_crash(&self, handle: &tauri::AppHandle, project_id: &str, epoch: u64) {
        loop {
            std::thread::sleep(CRASH_POLL_INTERVAL);
            if self.is_stale(epoch) {
                return;
            }
            let exited = {
                let mut guard = lock(&self.server);
                match guard.as_mut() {
                    Some(server) => match server.exited() {
                        Ok(exited) => exited,
                        Err(err) => {
                            tracing::error!("liveness probe failed: {err}");
                            true
                        }
                    },
                    None => return,
                }
            };
            if !exited {
                continue;
            }
            let tail = self.reap_server_tail(epoch).unwrap_or_default();
            self.fail(
                handle,
                project_id,
                epoch,
                "the superkick server exited unexpectedly".to_string(),
                tail,
            );
            return;
        }
    }

    fn fail(
        &self,
        handle: &tauri::AppHandle,
        project_id: &str,
        epoch: u64,
        message: String,
        tail: Vec<String>,
    ) {
        tracing::error!("boot failed for project {project_id}: {message}");
        if !lock(&self.machine).mark_failed(project_id, epoch, message, tail) {
            return;
        }
        self.emit_phase(handle);
        // The picker re-reads `boot_state` on load, so it shows the Failed UI.
        navigate_url(handle, self.home_url.clone());
    }

    fn emit_phase(&self, handle: &tauri::AppHandle) {
        let phase = self.boot_phase();
        if let Err(err) = handle.emit(BOOT_EVENT, &phase) {
            tracing::error!("failed to emit the boot phase: {err}");
        }
    }

    fn is_stale(&self, epoch: u64) -> bool {
        self.shutting_down.load(Ordering::SeqCst) || self.epoch.load(Ordering::SeqCst) != epoch
    }

    /// Stores the running server, or hands it back (un-stored) when this boot
    /// is stale or the app is already shutting down.
    fn store_server(&self, server: ServerProcess, epoch: u64) -> Option<ServerProcess> {
        let mut guard = lock(&self.server);
        if self.is_stale(epoch) {
            return Some(server);
        }
        let displaced = guard.take();
        *guard = Some(server);
        drop(guard);
        // A displaced server only exists if a newer boot raced in, which the
        // epoch check above rules out — but never leak a child on that bet.
        displaced
    }

    fn take_server(&self, epoch: u64) -> Option<ServerProcess> {
        let mut guard = lock(&self.server);
        if self.is_stale(epoch) {
            return None;
        }
        guard.take()
    }

    fn reap_server_tail(&self, epoch: u64) -> Option<Vec<String>> {
        self.take_server(epoch).map(|server| {
            let tail = server.log_tail();
            shutdown_server(server);
            tail
        })
    }
}

/// The supervisor's locks guard no invariant a panicking thread can corrupt,
/// so poisoned locks are recovered rather than orphaning the child process.
fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn shutdown_server(server: ServerProcess) {
    if let Err(err) = server.shutdown() {
        tracing::error!("server did not stop cleanly: {err}");
    }
}
