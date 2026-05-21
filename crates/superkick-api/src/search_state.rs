//! In-memory caches that back the `/search` handler.
//!
//! - `CommentCache`: snapshot of every Linear comment created in the last
//!   90 days, refreshed every 5 minutes from a background tokio task.
//!   Substring filtering on each search request runs against this snapshot
//!   in <5ms for a few thousand comments.
//! - `FileIndex`: list of repo file paths walked once at boot. Refresh is
//!   operator-triggered (`POST /search/files/refresh`) since the operator
//!   knows when the working tree has materially moved.
//!
//! Neither cache is required for the handler to function — both degrade to
//! an empty result set when absent or unavailable.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use chrono::{DateTime, Utc};
use superkick_integrations::linear::{CachedComment, LinearClient};
use tokio::sync::RwLock;

const COMMENT_CACHE_WINDOW_DAYS: u32 = 90;
const COMMENT_CACHE_MAX_ENTRIES: u32 = 1000;
const COMMENT_CACHE_REFRESH_SECS: u64 = 300;
const FILE_INDEX_MAX_ENTRIES: usize = 50_000;

/// Directory names skipped by the file walker. Hardcoded because the project
/// doesn't yet take a dep on the `ignore` crate; this list covers the
/// 99% case for a Rust + pnpm monorepo.
const SKIPPED_DIRS: &[&str] = &[
    ".git",
    ".worktrees",
    ".claude",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".vite",
    ".vercel",
    ".cache",
    ".pnpm-store",
];

#[derive(Debug, Default, Clone)]
pub struct CommentSnapshot {
    pub comments: Vec<CachedComment>,
    pub refreshed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub struct CommentCache {
    inner: Arc<RwLock<CommentSnapshot>>,
}

impl CommentCache {
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(CommentSnapshot::default())),
        }
    }

    pub async fn snapshot(&self) -> CommentSnapshot {
        self.inner.read().await.clone()
    }

    async fn replace(&self, comments: Vec<CachedComment>) {
        let mut guard = self.inner.write().await;
        guard.comments = comments;
        guard.refreshed_at = Some(Utc::now());
    }
}

impl Default for CommentCache {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct FileIndexEntry {
    pub path: String,
    pub repo: String,
    pub modified_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Default, Clone)]
pub struct FileSnapshot {
    pub entries: Vec<FileIndexEntry>,
    pub refreshed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub struct FileIndex {
    inner: Arc<RwLock<FileSnapshot>>,
    root: PathBuf,
    repo: String,
}

impl FileIndex {
    #[must_use]
    pub fn new(root: PathBuf, repo: String) -> Self {
        Self {
            inner: Arc::new(RwLock::new(FileSnapshot::default())),
            root,
            repo,
        }
    }

    pub async fn snapshot(&self) -> FileSnapshot {
        self.inner.read().await.clone()
    }

    /// Walk the root directory and replace the index. Returns the number of
    /// indexed paths.
    pub async fn refresh(&self) -> std::io::Result<usize> {
        let root = self.root.clone();
        let repo = self.repo.clone();
        let entries = tokio::task::spawn_blocking(move || walk_repo(&root, &repo))
            .await
            .map_err(|e| std::io::Error::other(e.to_string()))??;
        let count = entries.len();
        let mut guard = self.inner.write().await;
        guard.entries = entries;
        guard.refreshed_at = Some(Utc::now());
        Ok(count)
    }
}

fn walk_repo(root: &Path, repo: &str) -> std::io::Result<Vec<FileIndexEntry>> {
    let mut out: Vec<FileIndexEntry> = Vec::new();
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        if out.len() >= FILE_INDEX_MAX_ENTRIES {
            break;
        }
        let read = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for entry in read.flatten() {
            let path = entry.path();
            let name = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n,
                None => continue,
            };
            let file_type = match entry.file_type() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if file_type.is_dir() {
                if SKIPPED_DIRS.contains(&name) {
                    continue;
                }
                stack.push(path);
                continue;
            }
            if !file_type.is_file() {
                continue;
            }
            if name.starts_with('.') {
                continue;
            }
            let relative = path.strip_prefix(root).unwrap_or(&path);
            let rel_str = match relative.to_str() {
                Some(s) => s.to_string(),
                None => continue,
            };
            let modified_at = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .map(DateTime::<Utc>::from);
            out.push(FileIndexEntry {
                path: rel_str,
                repo: repo.to_string(),
                modified_at,
            });
            if out.len() >= FILE_INDEX_MAX_ENTRIES {
                break;
            }
        }
    }

    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

/// Spawn a detached task that hydrates the comment cache at boot and refreshes
/// it every `COMMENT_CACHE_REFRESH_SECS` seconds. Best-effort: any Linear
/// failure is logged and the cache stays as it was.
pub fn spawn_comment_refresh(client: Arc<LinearClient>, cache: CommentCache) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(COMMENT_CACHE_REFRESH_SECS));
        loop {
            ticker.tick().await;
            match client
                .recent_comments(COMMENT_CACHE_WINDOW_DAYS, COMMENT_CACHE_MAX_ENTRIES)
                .await
            {
                Ok(comments) => {
                    let count = comments.len();
                    cache.replace(comments).await;
                    tracing::info!(count, "search comment cache refreshed");
                }
                Err(err) => {
                    tracing::warn!(
                        error = %err,
                        "search comment cache refresh failed; keeping previous snapshot"
                    );
                }
            }
        }
    });
}

/// Walk the configured repo working tree once at boot. Logged at info on
/// success and warn on failure; the search handler returns empty file results
/// when the index is empty.
pub fn spawn_file_index_boot(index: FileIndex) {
    tokio::spawn(async move {
        match index.refresh().await {
            Ok(count) => tracing::info!(count, "search file index walked"),
            Err(err) => tracing::warn!(error = %err, "search file index walk failed"),
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn walker_skips_hardcoded_dirs() {
        let tmp = tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir_all(root.join("src")).unwrap();
        std::fs::create_dir_all(root.join("node_modules")).unwrap();
        std::fs::write(root.join("src/lib.rs"), "fn x() {}").unwrap();
        std::fs::write(root.join("node_modules/junk.js"), "bad").unwrap();

        let entries = walk_repo(root, "test").unwrap();
        assert!(entries.iter().any(|e| e.path == "src/lib.rs"));
        assert!(entries.iter().all(|e| !e.path.contains("node_modules")));
    }

    #[test]
    fn walker_skips_dotfiles() {
        let tmp = tempdir().unwrap();
        let root = tmp.path();
        std::fs::write(root.join("README.md"), "x").unwrap();
        std::fs::write(root.join(".env"), "y").unwrap();
        let entries = walk_repo(root, "test").unwrap();
        assert!(entries.iter().any(|e| e.path == "README.md"));
        assert!(entries.iter().all(|e| !e.path.starts_with('.')));
    }

    #[test]
    fn walker_paths_are_relative() {
        let tmp = tempdir().unwrap();
        let root = tmp.path();
        std::fs::create_dir(root.join("a")).unwrap();
        std::fs::write(root.join("a/b.txt"), "x").unwrap();
        let entries = walk_repo(root, "test").unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "a/b.txt");
        assert_eq!(entries[0].repo, "test");
    }
}
