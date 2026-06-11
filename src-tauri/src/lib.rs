pub mod commands;
pub mod env_path;
pub mod error;
pub mod lifecycle;
pub mod registry;
pub mod server_process;
pub mod signals;
pub mod spawn;
pub mod supervisor;
pub mod webview;

use std::path::Path;

use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::{Manager, RunEvent};

use registry::ProjectRegistry;
use supervisor::Supervisor;

const SWITCH_PROJECT_MENU_ID: &str = "switch-project";

pub fn run() {
    env_path::inherit_login_shell_path();
    init_tracing();
    signals::block_termination_signals();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_projects,
            commands::boot_state,
            commands::add_project,
            commands::select_project,
            commands::remove_project,
            commands::configure_project,
            commands::report_attention,
            commands::retry_boot,
            commands::restart_active_project,
            commands::show_picker,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let app_data_dir = handle.path().app_data_dir()?;
            let registry_path = app_data_dir.join("projects.json");
            let registry = load_registry(&registry_path)?;

            let home_url = app
                .get_webview_window("main")
                .ok_or("the `main` window was not created")?
                .url()?;
            app.manage(Supervisor::new(
                registry,
                registry_path,
                app_data_dir.join("projects"),
                home_url,
            ));

            install_menu(app)?;

            let supervisor = app.state::<Supervisor>();
            supervisor.boot_persisted_active(&handle);
            signals::spawn_signal_listener(handle);
            Ok(())
        })
        .on_menu_event(|handle, event| {
            if event.id() == SWITCH_PROJECT_MENU_ID {
                handle.state::<Supervisor>().go_home(handle);
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build the superkick desktop shell")
        .run(|handle, event| {
            if let RunEvent::Exit = event {
                if let Some(supervisor) = handle.try_state::<Supervisor>() {
                    supervisor.stop_all();
                }
            }
        });
}

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
}

/// `SUPERKICK_PROJECT_ROOT` is the dev escape hatch from slice 1: it seeds the
/// registry with that repo and selects it, so `just tauri-dev` still boots
/// straight into a project.
fn load_registry(registry_path: &Path) -> Result<ProjectRegistry, registry::RegistryError> {
    let mut registry = ProjectRegistry::load(registry_path)?;
    if let Some(root) = std::env::var_os("SUPERKICK_PROJECT_ROOT") {
        match registry.add(Path::new(&root)) {
            Ok(project) => {
                let id = project.id;
                registry.select(&id, chrono::Utc::now())?;
                registry.save(registry_path)?;
            }
            Err(err) => {
                tracing::warn!("ignoring SUPERKICK_PROJECT_ROOT: {err}");
            }
        }
    }
    Ok(registry)
}

fn install_menu(app: &tauri::App) -> tauri::Result<()> {
    let switch = MenuItem::with_id(
        app,
        SWITCH_PROJECT_MENU_ID,
        "Switch Project…",
        true,
        Some("CmdOrCtrl+Shift+O"),
    )?;
    let project = Submenu::with_items(app, "Project", true, &[&switch])?;
    let menu = Menu::default(app.handle())?;
    menu.append(&project)?;
    app.set_menu(menu)?;
    Ok(())
}
