//! Thin async wrapper around the `git` CLI.
//!
//! All repo and worktree operations shell out to `git` (not libgit2) for
//! reliability and transparency.

use std::path::Path;
use std::process::Output;

use anyhow::{Context, Result, bail};
use tokio::process::Command;
use tracing::debug;

/// Run a git command in `cwd` and return the trimmed stdout on success.
pub async fn git(cwd: &Path, args: &[&str]) -> Result<String> {
    let output = git_raw(cwd, args).await?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!(
            "git {} failed (exit {}): {}",
            args.join(" "),
            output.status.code().unwrap_or(-1),
            stderr.trim(),
        );
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(stdout)
}

/// Run a git command and return the raw `Output` without checking the exit code.
pub async fn git_raw(cwd: &Path, args: &[&str]) -> Result<Output> {
    debug!(cwd = %cwd.display(), cmd = %format!("git {}", args.join(" ")), "exec");
    Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .await
        .with_context(|| format!("failed to spawn git {}", args.join(" ")))
}
