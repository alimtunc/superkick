use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::lifecycle::BootPhase;
use crate::registry::{Project, RegistryError};
use crate::supervisor::Supervisor;

/// Serialized transparently, so the webview still receives a plain string.
#[derive(Debug, Serialize)]
pub struct CommandError(String);

impl From<RegistryError> for CommandError {
    fn from(err: RegistryError) -> Self {
        Self(err.to_string())
    }
}

/// What the webview sees. The Linear key itself never crosses the IPC
/// boundary — only whether one is set.
#[derive(Debug, Serialize)]
pub struct ProjectView {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub last_opened_at: Option<DateTime<Utc>>,
    pub has_linear_key: bool,
    pub attention_count: u32,
}

impl From<Project> for ProjectView {
    fn from(project: Project) -> Self {
        Self {
            id: project.id,
            name: project.name,
            path: project.path,
            last_opened_at: project.last_opened_at,
            has_linear_key: project.linear_api_key.is_some(),
            attention_count: project.attention_count,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct RegistrySnapshot {
    pub projects: Vec<ProjectView>,
    pub active_id: Option<String>,
}

#[tauri::command]
pub fn list_projects(supervisor: tauri::State<'_, Supervisor>) -> RegistrySnapshot {
    let registry = supervisor.registry_snapshot();
    RegistrySnapshot {
        projects: registry
            .projects
            .into_iter()
            .map(ProjectView::from)
            .collect(),
        active_id: registry.active_id,
    }
}

#[tauri::command]
pub fn boot_state(supervisor: tauri::State<'_, Supervisor>) -> BootPhase {
    supervisor.boot_phase()
}

#[tauri::command]
pub fn add_project(
    supervisor: tauri::State<'_, Supervisor>,
    path: PathBuf,
) -> Result<ProjectView, CommandError> {
    Ok(supervisor.add_project(&path).map(ProjectView::from)?)
}

#[tauri::command]
pub fn select_project(
    app: tauri::AppHandle,
    supervisor: tauri::State<'_, Supervisor>,
    id: String,
    return_path: Option<String>,
) -> Result<(), CommandError> {
    Ok(supervisor.select_project(&app, &id, return_path)?)
}

#[tauri::command]
pub fn remove_project(
    supervisor: tauri::State<'_, Supervisor>,
    id: String,
) -> Result<(), CommandError> {
    Ok(supervisor.remove_project(&id)?)
}

#[tauri::command]
pub fn configure_project(
    app: tauri::AppHandle,
    supervisor: tauri::State<'_, Supervisor>,
    id: String,
    linear_api_key: Option<String>,
    return_path: Option<String>,
) -> Result<(), CommandError> {
    Ok(supervisor.configure_project(&app, &id, linear_api_key, return_path)?)
}

#[tauri::command]
pub fn report_attention(
    supervisor: tauri::State<'_, Supervisor>,
    project_id: String,
    count: u32,
) -> Result<(), CommandError> {
    Ok(supervisor.report_attention(&project_id, count)?)
}

#[tauri::command]
pub fn retry_boot(app: tauri::AppHandle, supervisor: tauri::State<'_, Supervisor>) {
    supervisor.retry_boot(&app);
}

#[tauri::command]
pub fn restart_active_project(
    app: tauri::AppHandle,
    supervisor: tauri::State<'_, Supervisor>,
    return_path: Option<String>,
) {
    supervisor.restart_active_project(&app, return_path);
}

#[tauri::command]
pub fn show_picker(app: tauri::AppHandle, supervisor: tauri::State<'_, Supervisor>) {
    supervisor.go_home(&app);
}
