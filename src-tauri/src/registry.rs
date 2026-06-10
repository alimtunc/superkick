use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum RegistryError {
    #[error("{} is not a directory", .path.display())]
    NotADirectory { path: PathBuf },

    #[error("{} is not a git repository (no .git entry)", .path.display())]
    NotAGitRepository { path: PathBuf },

    #[error("failed to resolve {}: {source}", .path.display())]
    Canonicalize {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("no project with id {id}")]
    UnknownProject { id: String },

    #[error("cannot remove the active project while its server may be running")]
    RemoveActive,

    #[error("failed to read registry file {}: {source}", .path.display())]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("failed to write registry file {}: {source}", .path.display())]
    Write {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("registry file {} is not valid JSON: {source}", .path.display())]
    Parse {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub last_opened_at: Option<DateTime<Utc>>,
    /// Passed to the spawned server's environment. Optional — without it the
    /// server boots fine and Linear-backed endpoints answer 503.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub linear_api_key: Option<String>,
    #[serde(default)]
    pub attention_count: u32,
}

/// App-wide project list persisted outside any project repo (in the desktop
/// app's data dir), so registering a repo never writes into it.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProjectRegistry {
    pub projects: Vec<Project>,
    pub active_id: Option<String>,
}

impl ProjectRegistry {
    /// A missing file is a fresh install, not an error.
    pub fn load(path: &Path) -> Result<Self, RegistryError> {
        let raw = match std::fs::read_to_string(path) {
            Ok(raw) => raw,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Self::default()),
            Err(source) => {
                return Err(RegistryError::Read {
                    path: path.to_path_buf(),
                    source,
                });
            }
        };
        serde_json::from_str(&raw).map_err(|source| RegistryError::Parse {
            path: path.to_path_buf(),
            source,
        })
    }

    /// Atomic write (temp file + rename) so a crash mid-save never truncates the registry.
    pub fn save(&self, path: &Path) -> Result<(), RegistryError> {
        let write_err = |source| RegistryError::Write {
            path: path.to_path_buf(),
            source,
        };
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(write_err)?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|source| RegistryError::Parse {
            path: path.to_path_buf(),
            source,
        })?;
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, json).map_err(write_err)?;
        std::fs::rename(&tmp, path).map_err(write_err)
    }

    /// Registers a local git repository. Re-adding an already-registered path
    /// returns the existing entry instead of duplicating it.
    pub fn add(&mut self, path: &Path) -> Result<Project, RegistryError> {
        let canonical = validate_project_path(path)?;
        if let Some(existing) = self.projects.iter().find(|p| p.path == canonical) {
            return Ok(existing.clone());
        }
        let project = Project {
            id: uuid::Uuid::new_v4().to_string(),
            name: project_name(&canonical),
            path: canonical,
            last_opened_at: None,
            linear_api_key: None,
            attention_count: 0,
        };
        self.projects.push(project.clone());
        Ok(project)
    }

    pub fn select(&mut self, id: &str, now: DateTime<Utc>) -> Result<Project, RegistryError> {
        let project = self
            .projects
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| RegistryError::UnknownProject { id: id.to_string() })?;
        project.last_opened_at = Some(now);
        let project = project.clone();
        self.active_id = Some(project.id.clone());
        Ok(project)
    }

    /// Blank or whitespace-only input clears the key.
    pub fn set_linear_api_key(
        &mut self,
        id: &str,
        key: Option<String>,
    ) -> Result<Project, RegistryError> {
        let project = self
            .projects
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| RegistryError::UnknownProject { id: id.to_string() })?;
        project.linear_api_key = key.map(|k| k.trim().to_string()).filter(|k| !k.is_empty());
        Ok(project.clone())
    }

    /// Returns `Ok(true)` only when the value changed, so callers can skip
    /// redundant saves.
    pub fn set_attention_count(&mut self, id: &str, count: u32) -> Result<bool, RegistryError> {
        let project = self
            .projects
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| RegistryError::UnknownProject { id: id.to_string() })?;
        if project.attention_count == count {
            return Ok(false);
        }
        project.attention_count = count;
        Ok(true)
    }

    pub fn remove(&mut self, id: &str) -> Result<(), RegistryError> {
        if self.active_id.as_deref() == Some(id) {
            return Err(RegistryError::RemoveActive);
        }
        let before = self.projects.len();
        self.projects.retain(|p| p.id != id);
        if self.projects.len() == before {
            return Err(RegistryError::UnknownProject { id: id.to_string() });
        }
        Ok(())
    }

    #[must_use]
    pub fn active(&self) -> Option<&Project> {
        let id = self.active_id.as_deref()?;
        self.projects.iter().find(|p| p.id == id)
    }
}

/// `.git` may be a directory (normal clone) or a file (worktree / submodule).
fn validate_project_path(path: &Path) -> Result<PathBuf, RegistryError> {
    if !path.is_dir() {
        return Err(RegistryError::NotADirectory {
            path: path.to_path_buf(),
        });
    }
    let canonical = path
        .canonicalize()
        .map_err(|source| RegistryError::Canonicalize {
            path: path.to_path_buf(),
            source,
        })?;
    if !canonical.join(".git").exists() {
        return Err(RegistryError::NotAGitRepository { path: canonical });
    }
    Ok(canonical)
}

fn project_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string())
}
