//! Repo cache — maintains a bare clone per repository slug.
//!
//! The cache directory lives at `<cache_root>/<sanitised_slug>.git`.
//! On first access the repo is cloned with `--bare`; subsequent accesses
//! run `git fetch --prune` to stay up-to-date.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use tracing::{info, warn};

use crate::git;

/// Manages a directory of bare-clone caches, one per repo slug.
#[derive(Debug, Clone)]
pub struct RepoCache {
    /// Root directory that holds all cached bare repos.
    cache_root: PathBuf,
}

impl RepoCache {
    /// Create a new `RepoCache` rooted at `cache_root`.
    ///
    /// The directory is created if it does not exist.
    pub async fn new(cache_root: PathBuf) -> Result<Self> {
        tokio::fs::create_dir_all(&cache_root)
            .await
            .with_context(|| format!("failed to create cache root: {}", cache_root.display()))?;
        Ok(Self { cache_root })
    }

    /// Ensure the repo at `clone_url` is cached and up-to-date.
    ///
    /// Returns the path to the bare clone directory.
    pub async fn ensure(&self, repo_slug: &str, clone_url: &str) -> Result<PathBuf> {
        let dir_name = sanitise_slug(repo_slug);
        let bare_path = self.cache_root.join(format!("{dir_name}.git"));

        if bare_path.join("HEAD").exists() {
            self.fetch(&bare_path, repo_slug).await?;
        } else {
            self.clone(clone_url, &bare_path, repo_slug).await?;
        }

        Ok(bare_path)
    }

    /// Remove a cached repo by slug.
    pub async fn remove(&self, repo_slug: &str) -> Result<()> {
        let dir_name = sanitise_slug(repo_slug);
        let bare_path = self.cache_root.join(format!("{dir_name}.git"));
        if bare_path.exists() {
            info!(repo_slug, path = %bare_path.display(), "removing cached repo");
            tokio::fs::remove_dir_all(&bare_path)
                .await
                .with_context(|| {
                    format!("failed to remove cache dir: {}", bare_path.display())
                })?;
        }
        Ok(())
    }

    /// Remove all cached repos.
    pub async fn purge(&self) -> Result<()> {
        if self.cache_root.exists() {
            info!(path = %self.cache_root.display(), "purging repo cache");
            tokio::fs::remove_dir_all(&self.cache_root).await?;
            tokio::fs::create_dir_all(&self.cache_root).await?;
        }
        Ok(())
    }

    /// Return the path where a cached bare clone for `repo_slug` would live.
    pub fn cache_path(&self, repo_slug: &str) -> PathBuf {
        let dir_name = sanitise_slug(repo_slug);
        self.cache_root.join(format!("{dir_name}.git"))
    }

    // ── internal ────────────────────────────────────────────────────

    async fn clone(&self, clone_url: &str, bare_path: &Path, repo_slug: &str) -> Result<()> {
        info!(repo_slug, path = %bare_path.display(), "cloning repo (bare)");
        // Clone into a temp dir first, then rename — prevents partial clones on crash.
        let tmp_path = bare_path.with_extension("git.tmp");
        if tmp_path.exists() {
            warn!(path = %tmp_path.display(), "removing stale partial clone");
            tokio::fs::remove_dir_all(&tmp_path).await?;
        }

        git::git(
            &self.cache_root,
            &[
                "clone",
                "--bare",
                "--quiet",
                clone_url,
                tmp_path
                    .file_name()
                    .unwrap()
                    .to_str()
                    .unwrap(),
            ],
        )
        .await
        .with_context(|| format!("failed to bare-clone {repo_slug}"))?;

        tokio::fs::rename(&tmp_path, bare_path)
            .await
            .with_context(|| format!("failed to rename tmp clone to {}", bare_path.display()))?;

        Ok(())
    }

    async fn fetch(&self, bare_path: &Path, repo_slug: &str) -> Result<()> {
        info!(repo_slug, path = %bare_path.display(), "fetching updates");
        git::git(bare_path, &["fetch", "--prune", "--quiet"])
            .await
            .with_context(|| format!("failed to fetch updates for {repo_slug}"))?;
        Ok(())
    }
}

/// Replace characters that are unsafe in directory names.
fn sanitise_slug(slug: &str) -> String {
    slug.replace('/', "--")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitise_slug_replaces_slash() {
        assert_eq!(sanitise_slug("owner/repo"), "owner--repo");
    }

    #[test]
    fn sanitise_slug_no_slash() {
        assert_eq!(sanitise_slug("my-repo"), "my-repo");
    }
}
