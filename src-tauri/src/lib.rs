pub mod error;
pub mod server_process;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, RunEvent};

use server_process::{ServerProcess, SpawnConfig, wait_for_port_file};

const PORT_FILE_TIMEOUT: Duration = Duration::from_secs(30);
const DEFAULT_START_PORT: u16 = 3100;

#[derive(Default)]
struct ServerState {
    shutting_down: bool,
    server: Option<ServerProcess>,
}

struct ManagedServer(Mutex<ServerState>);

pub fn run() {
    init_tracing();

    tauri::Builder::default()
        .manage(ManagedServer(Mutex::new(ServerState::default())))
        .setup(|app| {
            let handle = app.handle().clone();
            std::thread::spawn(move || start_server(&handle));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the superkick desktop shell")
        .run(|handle, event| {
            if let RunEvent::Exit = event {
                stop_server(handle);
            }
        });
}

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
}

fn start_server(handle: &tauri::AppHandle) {
    let server = match ServerProcess::spawn(spawn_config()) {
        Ok(server) => server,
        Err(err) => {
            tracing::error!("superkick shell could not start the server: {err}");
            return;
        }
    };
    let port_file = server.port_file().to_path_buf();

    // Register the child before the (slow) port wait so a quit mid-boot tears it down, not orphans it.
    if let Some(orphan) = store_server(handle, server) {
        shutdown_server(orphan);
        return;
    }

    match wait_for_port_file(&port_file, PORT_FILE_TIMEOUT) {
        Ok(port) => navigate_to_server(handle, port),
        Err(err) => {
            tracing::error!("server did not report a port in time: {err}");
            if let Some(server) = take_server(handle) {
                shutdown_server(server);
            }
        }
    }
}

fn spawn_config() -> SpawnConfig {
    let workspace_root = workspace_root();
    let project_root = std::env::var_os("SUPERKICK_PROJECT_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| workspace_root.clone());
    SpawnConfig {
        binary: workspace_root
            .join("target")
            .join("debug")
            .join(api_binary_name()),
        project_root,
        config_path: std::env::var("SUPERKICK_CONFIG").unwrap_or_else(|_| "superkick.yaml".into()),
        database_url: std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "sqlite:superkick.db".into()),
        cache_dir: std::env::var("SUPERKICK_CACHE_DIR")
            .unwrap_or_else(|_| ".superkick-cache".into()),
        start_port: std::env::var("PORT")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(DEFAULT_START_PORT),
    }
}

/// Dev-only resolution: the crate lives at `<workspace>/src-tauri`. A packaged app resolves its
/// own bundle path — bundling is out of scope for this shell.
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

/// Stores the running server, or hands it back (un-stored) when the app is already shutting down.
fn store_server(handle: &tauri::AppHandle, server: ServerProcess) -> Option<ServerProcess> {
    let Some(state) = handle.try_state::<ManagedServer>() else {
        tracing::error!("managed server state was not registered");
        return Some(server);
    };
    match state.0.lock() {
        Ok(mut guard) => {
            if guard.shutting_down {
                Some(server)
            } else {
                guard.server = Some(server);
                None
            }
        }
        Err(_) => {
            tracing::error!("server state lock was poisoned");
            Some(server)
        }
    }
}

fn take_server(handle: &tauri::AppHandle) -> Option<ServerProcess> {
    let state = handle.try_state::<ManagedServer>()?;
    state
        .0
        .lock()
        .ok()
        .and_then(|mut guard| guard.server.take())
}

fn shutdown_server(server: ServerProcess) {
    if let Err(err) = server.shutdown() {
        tracing::error!("server did not stop cleanly: {err}");
    }
}

fn navigate_to_server(handle: &tauri::AppHandle, port: u16) {
    let url = match format!("http://localhost:{port}").parse::<tauri::Url>() {
        Ok(url) => url,
        Err(err) => {
            tracing::error!("constructed an invalid server url for port {port}: {err}");
            return;
        }
    };
    let inner = handle.clone();
    let dispatched = handle.run_on_main_thread(move || {
        let Some(window) = inner.get_webview_window("main") else {
            tracing::error!("no `main` window to display the dashboard");
            return;
        };
        if let Err(err) = window.navigate(url) {
            tracing::error!("failed to load the dashboard: {err}");
        }
    });
    if let Err(err) = dispatched {
        tracing::error!("failed to dispatch dashboard navigation: {err}");
    }
}

fn stop_server(handle: &tauri::AppHandle) {
    let Some(state) = handle.try_state::<ManagedServer>() else {
        return;
    };
    let server = match state.0.lock() {
        Ok(mut guard) => {
            guard.shutting_down = true;
            guard.server.take()
        }
        Err(_) => None,
    };
    if let Some(server) = server {
        shutdown_server(server);
    }
}
