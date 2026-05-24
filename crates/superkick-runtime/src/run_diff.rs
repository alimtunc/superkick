//! SUP-172 — read-only diff collection for a Run / Launch Task worktree.
//!
//! Shells out to `git` (matches the rest of this crate — no `git2` dep) and
//! returns a [`RunDiff`] payload bounded in both per-file patch size and
//! file count so a runaway diff cannot OOM the API.

use std::path::Path;

use thiserror::Error;
use tokio::fs;
use tracing::debug;

use superkick_core::{FileDiff, FileDiffStatus, RunDiff};

use crate::git::git;

/// Per-file patch size cap. Patches above this are dropped with
/// `truncated: true` so the UI can render a "diff too large" placeholder
/// without us streaming megabytes of text.
pub const MAX_PATCH_BYTES: usize = 256 * 1024;

/// Per-run file count cap. Beyond this, overflow files appear only as
/// metadata entries with `patch: None, truncated: true` and the parent
/// `RunDiff.overflow` is set to `true`.
pub const MAX_FILES: usize = 500;

/// SHA of git's canonical empty tree. Used as a base-ref fallback when a
/// worktree has only one commit (no `HEAD~1`) so the first commit still
/// produces a usable diff.
const EMPTY_TREE_SHA: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/// Errors the API handler maps onto `AppError`. `WorktreeMissing` is
/// distinct from a generic git failure so the handler can return a 404 for
/// cleaned-up worktrees while keeping real exec failures as 500s.
#[derive(Debug, Error)]
pub enum DiffError {
    #[error("worktree path does not exist or is not a git repository")]
    WorktreeMissing,
    #[error(transparent)]
    Git(#[from] anyhow::Error),
}

/// Collect a read-only diff for a worktree.
///
/// `base_branch` is the workspace's default branch (e.g. `"main"`). The
/// collector picks the most specific available ref — `origin/<base>`,
/// then local `<base>`, then `HEAD~1`, then the empty-tree SHA — so the
/// diff is meaningful even when the workspace has no remote, hasn't
/// fetched yet, or only has a single commit.
pub async fn collect_run_diff(
    worktree_path: &Path,
    base_branch: &str,
) -> Result<RunDiff, DiffError> {
    if !worktree_path.exists() {
        return Err(DiffError::WorktreeMissing);
    }
    git(worktree_path, &["rev-parse", "--git-dir"])
        .await
        .map_err(|_| DiffError::WorktreeMissing)?;

    let head_ref = git(worktree_path, &["rev-parse", "--short", "HEAD"]).await?;
    let base_full = resolve_base_ref(worktree_path, base_branch).await?;
    let base_ref = git(worktree_path, &["rev-parse", "--short", &base_full])
        .await
        .unwrap_or_else(|_| base_full.chars().take(7).collect());

    let entries = collect_tracked_entries(worktree_path, &base_full).await?;
    let untracked = collect_untracked(worktree_path).await?;

    let total = entries.len() + untracked.len();
    let overflow = total > MAX_FILES;

    let mut files: Vec<FileDiff> = Vec::with_capacity(total.min(MAX_FILES));

    for entry in entries {
        if files.len() >= MAX_FILES {
            break;
        }
        let path_for_diff = entry.path.clone();
        let raw_patch = git(
            worktree_path,
            &[
                "diff",
                "--no-color",
                "--no-ext-diff",
                &base_full,
                "--",
                &path_for_diff,
            ],
        )
        .await?;
        let (patch, binary, truncated) = shape_patch(&raw_patch);
        let (additions, deletions) = count_changes(&raw_patch);
        files.push(FileDiff {
            path: entry.path,
            status: entry.status,
            old_path: entry.old_path,
            additions,
            deletions,
            binary,
            truncated,
            patch,
        });
    }

    for path in untracked {
        if files.len() >= MAX_FILES {
            break;
        }
        let (patch, binary, truncated, additions) =
            synthesize_added_patch(worktree_path, &path).await?;
        files.push(FileDiff {
            path,
            status: FileDiffStatus::Untracked,
            old_path: None,
            additions,
            deletions: 0,
            binary,
            truncated,
            patch,
        });
    }

    Ok(RunDiff {
        base_ref,
        head_ref,
        files,
        file_count: total as u32,
        overflow,
    })
}

async fn resolve_base_ref(cwd: &Path, base_branch: &str) -> Result<String, DiffError> {
    let remote = format!("origin/{base_branch}");
    if let Ok(sha) = git(cwd, &["merge-base", "HEAD", &remote]).await {
        return Ok(sha);
    }
    if let Ok(sha) = git(cwd, &["merge-base", "HEAD", base_branch]).await {
        return Ok(sha);
    }
    if let Ok(sha) = git(cwd, &["rev-parse", "HEAD~1"]).await {
        return Ok(sha);
    }
    Ok(EMPTY_TREE_SHA.to_string())
}

#[derive(Debug)]
struct NameStatusEntry {
    status: FileDiffStatus,
    path: String,
    old_path: Option<String>,
}

async fn collect_tracked_entries(
    cwd: &Path,
    base_full: &str,
) -> Result<Vec<NameStatusEntry>, DiffError> {
    let raw = git(
        cwd,
        &[
            "diff",
            "--name-status",
            "--no-color",
            "--no-ext-diff",
            "-M",
            base_full,
        ],
    )
    .await?;
    Ok(raw.lines().filter_map(parse_name_status_line).collect())
}

fn parse_name_status_line(line: &str) -> Option<NameStatusEntry> {
    let mut parts = line.splitn(3, '\t');
    let raw_status = parts.next()?;
    let first = parts.next()?;
    let second = parts.next();
    let first_char = raw_status.chars().next()?;

    match first_char {
        'R' => Some(NameStatusEntry {
            status: FileDiffStatus::Renamed,
            path: second?.to_string(),
            old_path: Some(first.to_string()),
        }),
        'C' => Some(NameStatusEntry {
            status: FileDiffStatus::Added,
            path: second?.to_string(),
            old_path: Some(first.to_string()),
        }),
        'A' => Some(NameStatusEntry {
            status: FileDiffStatus::Added,
            path: first.to_string(),
            old_path: None,
        }),
        'M' => Some(NameStatusEntry {
            status: FileDiffStatus::Modified,
            path: first.to_string(),
            old_path: None,
        }),
        'D' => Some(NameStatusEntry {
            status: FileDiffStatus::Deleted,
            path: first.to_string(),
            old_path: None,
        }),
        'T' => Some(NameStatusEntry {
            status: FileDiffStatus::TypeChange,
            path: first.to_string(),
            old_path: None,
        }),
        _ => None,
    }
}

async fn collect_untracked(cwd: &Path) -> Result<Vec<String>, DiffError> {
    let raw = git(cwd, &["ls-files", "--others", "--exclude-standard"]).await?;
    Ok(raw
        .lines()
        .filter(|l| !l.is_empty())
        .map(|s| s.to_string())
        .collect())
}

/// Apply the per-file patch cap and detect the binary marker.
///
/// `git diff` emits `Binary files a/<p> and b/<p> differ` for binary
/// content; we surface that as `binary: true, patch: None`. An empty
/// patch (rare — e.g. mode-only changes after rename detection) returns
/// `(None, false, false)`.
fn shape_patch(raw: &str) -> (Option<String>, bool, bool) {
    if raw.is_empty() {
        return (None, false, false);
    }
    if !raw.contains("\n@@ ") && !raw.starts_with("@@ ") && raw.contains("Binary files ") {
        return (None, true, false);
    }
    if raw.len() > MAX_PATCH_BYTES {
        return (None, false, true);
    }
    (Some(raw.to_string()), false, false)
}

fn count_changes(patch: &str) -> (u32, u32) {
    let mut adds = 0u32;
    let mut dels = 0u32;
    for line in patch.lines() {
        if line.starts_with("+++") || line.starts_with("---") {
            continue;
        }
        if line.starts_with('+') {
            adds = adds.saturating_add(1);
        } else if line.starts_with('-') {
            dels = dels.saturating_add(1);
        }
    }
    (adds, dels)
}

async fn synthesize_added_patch(
    cwd: &Path,
    rel_path: &str,
) -> Result<(Option<String>, bool, bool, u32), DiffError> {
    let abs = cwd.join(rel_path);
    let bytes = match fs::read(&abs).await {
        Ok(b) => b,
        Err(err) => {
            debug!(path = %abs.display(), %err, "skipping unreadable untracked file");
            return Ok((None, false, false, 0));
        }
    };
    if bytes.contains(&0u8) {
        return Ok((None, true, false, 0));
    }
    if bytes.len() > MAX_PATCH_BYTES {
        return Ok((None, false, true, 0));
    }
    let text = match std::str::from_utf8(&bytes) {
        Ok(t) => t,
        Err(_) => return Ok((None, true, false, 0)),
    };
    let line_count = text.lines().count() as u32;
    let body: String = text.lines().map(|l| format!("+{l}\n")).collect::<String>();
    let header = format!(
        "diff --git a/{path} b/{path}\nnew file\n--- /dev/null\n+++ b/{path}\n@@ -0,0 +1,{n} @@\n",
        path = rel_path,
        n = line_count
    );
    let patch = format!("{header}{body}");
    if patch.len() > MAX_PATCH_BYTES {
        return Ok((None, false, true, line_count));
    }
    Ok((Some(patch), false, false, line_count))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_modified() {
        let entry = parse_name_status_line("M\tsrc/foo.rs").unwrap();
        assert_eq!(entry.status, FileDiffStatus::Modified);
        assert_eq!(entry.path, "src/foo.rs");
        assert!(entry.old_path.is_none());
    }

    #[test]
    fn parse_added() {
        let entry = parse_name_status_line("A\tsrc/bar.rs").unwrap();
        assert_eq!(entry.status, FileDiffStatus::Added);
    }

    #[test]
    fn parse_rename_carries_old_path() {
        let entry = parse_name_status_line("R100\told/path.rs\tnew/path.rs").unwrap();
        assert_eq!(entry.status, FileDiffStatus::Renamed);
        assert_eq!(entry.path, "new/path.rs");
        assert_eq!(entry.old_path.as_deref(), Some("old/path.rs"));
    }

    #[test]
    fn parse_copy_treated_as_added_with_source() {
        let entry = parse_name_status_line("C75\told.rs\tnew.rs").unwrap();
        assert_eq!(entry.status, FileDiffStatus::Added);
        assert_eq!(entry.path, "new.rs");
        assert_eq!(entry.old_path.as_deref(), Some("old.rs"));
    }

    #[test]
    fn count_changes_ignores_file_headers() {
        let patch = "--- a/x\n+++ b/x\n@@ -1,2 +1,3 @@\n line\n-old\n+new\n+extra\n";
        let (adds, dels) = count_changes(patch);
        assert_eq!(adds, 2);
        assert_eq!(dels, 1);
    }

    #[test]
    fn shape_patch_flags_binary() {
        let raw = "diff --git a/foo b/foo\nBinary files a/foo and b/foo differ\n";
        let (patch, binary, truncated) = shape_patch(raw);
        assert!(patch.is_none());
        assert!(binary);
        assert!(!truncated);
    }

    #[test]
    fn shape_patch_truncates_oversize() {
        let mut huge = String::from("@@ -1 +1 @@\n");
        huge.push_str(&"+x\n".repeat(MAX_PATCH_BYTES / 3 + 10));
        let (patch, binary, truncated) = shape_patch(&huge);
        assert!(patch.is_none());
        assert!(!binary);
        assert!(truncated);
    }

    #[test]
    fn shape_patch_passes_normal() {
        let raw = "@@ -1 +1 @@\n-a\n+b\n";
        let (patch, binary, truncated) = shape_patch(raw);
        assert_eq!(patch.as_deref(), Some(raw));
        assert!(!binary);
        assert!(!truncated);
    }
}
