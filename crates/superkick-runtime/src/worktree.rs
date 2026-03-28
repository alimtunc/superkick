//! Worktree manager — creates and cleans up isolated git worktrees for runs.
//!
//! Each run gets a dedicated worktree branching off `base_branch`. The
//! worktree directory name is deterministic: `<prefix>-<run_id>`, which
//! allows safe repeated creation (idempotent) and cleanup.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use superkick_core::id::RunId;
use tracing::{info, warn};

use crate::git;

/// Manages worktree creation and cleanup for a single cached bare repo.
#[derive(Debug, Clone)]
pub struct WorktreeManager {
    /// Path to the bare-clone cache for this repo.
    bare_repo: PathBuf,
    /// Root directory under which all worktrees are created.
    worktree_root: PathBuf,
    /// Prefix used in worktree directory names (e.g. "superkick").
    prefix: String,
}

/// Information about a created worktree.
#[derive(Debug, Clone)]
pub struct WorktreeInfo {
    /// Absolute path to the worktree directory.
    pub path: PathBuf,
    /// Branch name created for this worktree.
    pub branch: String,
}

impl WorktreeManager {
    /// Create a new worktree manager.
    ///
    /// - `bare_repo` — path to the bare-clone cache directory.
    /// - `worktree_root` — parent directory where worktrees are placed.
    /// - `prefix` — prefix for directory and branch names (e.g. "superkick").
    pub async fn new(
        bare_repo: PathBuf,
        worktree_root: PathBuf,
        prefix: String,
    ) -> Result<Self> {
        tokio::fs::create_dir_all(&worktree_root)
            .await
            .with_context(|| {
                format!(
                    "failed to create worktree root: {}",
                    worktree_root.display()
                )
            })?;
        Ok(Self {
            bare_repo,
            worktree_root,
            prefix,
        })
    }

    /// Create a worktree for the given run, branching off `base_branch`.
    ///
    /// The worktree directory name is `<prefix>-<run_id>` and the branch
    /// name is `<prefix>/<issue_identifier>-<short_run_id>`.
    ///
    /// The issue identifier (e.g. `LES-56`) links the branch to Linear,
    /// while the short run-id suffix guarantees uniqueness across retries.
    /// If the worktree already exists (e.g. from a previous attempt), it
    /// is removed first.
    pub async fn create(
        &self,
        run_id: RunId,
        issue_identifier: &str,
        base_branch: &str,
    ) -> Result<WorktreeInfo> {
        let short_id = &run_id.to_string()[..8];
        let dir_name = format!("{}-{}", self.prefix, run_id);
        // Must canonicalize to absolute path — `git worktree add` runs inside
        // the bare repo, so relative paths would resolve relative to it.
        let wt_path = std::env::current_dir()
            .context("failed to get current dir")?
            .join(&self.worktree_root)
            .join(&dir_name);
        let branch = format!(
            "{}/{}-{}",
            self.prefix,
            issue_identifier.to_lowercase(),
            short_id,
        );

        // If a stale worktree from a previous attempt exists, clean it up.
        if wt_path.exists() {
            warn!(path = %wt_path.display(), "removing stale worktree");
            self.remove_worktree(&wt_path).await?;
        }

        // Delete local branch if it exists (leftover from a previous attempt
        // of the same run). The short run-id suffix in the branch name makes
        // collisions with *other* runs impossible, so we only need to clean up
        // our own stale state.
        self.delete_branch_if_exists(&branch).await?;

        // In a bare clone, branches live under refs/heads/ (no "origin/" prefix).
        // Try origin/<branch> first (mirror clones), then fall back to <branch>.
        let start_point = {
            let origin_ref = format!("origin/{base_branch}");
            let result = git::git_raw(&self.bare_repo, &["rev-parse", "--verify", &origin_ref]).await;
            if result.is_ok() && result.unwrap().status.success() {
                origin_ref
            } else {
                base_branch.to_string()
            }
        };

        info!(
            run_id = %run_id,
            branch = %branch,
            path = %wt_path.display(),
            "creating worktree",
        );

        git::git(
            &self.bare_repo,
            &[
                "worktree",
                "add",
                "-b",
                &branch,
                wt_path.to_str().unwrap(),
                &start_point,
            ],
        )
        .await
        .with_context(|| format!("failed to create worktree for run {run_id}"))?;

        Ok(WorktreeInfo {
            path: wt_path,
            branch,
        })
    }

    /// Remove a worktree by its path and prune stale entries.
    pub async fn cleanup(&self, wt_path: &Path) -> Result<()> {
        self.remove_worktree(wt_path).await
    }

    /// Remove all worktrees that match the prefix and prune.
    pub async fn cleanup_all(&self) -> Result<()> {
        let mut entries = tokio::fs::read_dir(&self.worktree_root)
            .await
            .with_context(|| {
                format!(
                    "failed to read worktree root: {}",
                    self.worktree_root.display()
                )
            })?;

        while let Some(entry) = entries.next_entry().await? {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with(&format!("{}-", self.prefix)) {
                let path = entry.path();
                info!(path = %path.display(), "cleaning up worktree");
                if let Err(e) = self.remove_worktree(&path).await {
                    warn!(path = %path.display(), error = %e, "failed to clean up worktree");
                }
            }
        }

        Ok(())
    }

    /// Prune stale worktree bookkeeping entries from the bare repo.
    pub async fn prune(&self) -> Result<()> {
        info!(bare_repo = %self.bare_repo.display(), "pruning worktree metadata");
        git::git(&self.bare_repo, &["worktree", "prune"])
            .await
            .context("failed to prune worktrees")?;
        Ok(())
    }

    // ── internal ────────────────────────────────────────────────────

    async fn remove_worktree(&self, wt_path: &Path) -> Result<()> {
        if !wt_path.exists() {
            // Already gone — just prune metadata.
            self.prune().await?;
            return Ok(());
        }

        // `git worktree remove --force` removes the directory and the metadata.
        let result = git::git(
            &self.bare_repo,
            &["worktree", "remove", "--force", wt_path.to_str().unwrap()],
        )
        .await;

        match result {
            Ok(_) => {}
            Err(e) => {
                // If git refuses, fall back to manual removal + prune.
                warn!(
                    path = %wt_path.display(),
                    error = %e,
                    "git worktree remove failed, falling back to manual cleanup",
                );
                if wt_path.exists() {
                    tokio::fs::remove_dir_all(wt_path).await.with_context(|| {
                        format!("failed to remove worktree dir: {}", wt_path.display())
                    })?;
                }
                self.prune().await?;
            }
        }

        Ok(())
    }

    async fn delete_branch_if_exists(&self, branch: &str) -> Result<()> {
        let result = git::git_raw(&self.bare_repo, &["branch", "--list", branch]).await?;
        let stdout = String::from_utf8_lossy(&result.stdout);
        if !stdout.trim().is_empty() {
            info!(branch, "deleting leftover branch");
            // Force-delete — it's a local branch we fully own.
            git::git(&self.bare_repo, &["branch", "-D", branch])
                .await
                .with_context(|| format!("failed to delete leftover branch {branch}"))?;
        }
        Ok(())
    }
}

/// Build the default cache root path: `<repo_root>/.superkick/cache`.
pub fn default_cache_root(repo_root: &Path) -> PathBuf {
    repo_root.join(".superkick").join("cache")
}

/// Build the default worktree root path: `<repo_root>/superkick-worktrees`.
///
/// Placed outside hidden directories so that VSCode's Source Control
/// automatically discovers the worktree git repos.
pub fn default_worktree_root(repo_root: &Path) -> PathBuf {
    repo_root.join("superkick-worktrees")
}

/// Build a clone URL from a repo slug (owner/repo → https://github.com/owner/repo.git).
pub fn github_clone_url(repo_slug: &str) -> String {
    format!("https://github.com/{repo_slug}.git")
}
