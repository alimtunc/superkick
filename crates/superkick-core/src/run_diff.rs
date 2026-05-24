//! SUP-172 — read-only diff types for a Run / Launch Task worktree.
//!
//! The runtime layer (`superkick-runtime::run_diff`) populates these by
//! shelling out to `git`; the API layer (`superkick-api`) serialises them
//! straight to JSON for the dashboard's file-diff viewer.

use serde::{Deserialize, Serialize};

/// Status of a file in a [`RunDiff`].
///
/// `Untracked` is included so the V1 viewer can show files that an agent
/// created but did not yet `git add`. `Renamed` carries `old_path` on the
/// owning [`FileDiff`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileDiffStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    TypeChange,
    Untracked,
}

impl std::fmt::Display for FileDiffStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Added => "added",
            Self::Modified => "modified",
            Self::Deleted => "deleted",
            Self::Renamed => "renamed",
            Self::TypeChange => "type_change",
            Self::Untracked => "untracked",
        };
        f.write_str(s)
    }
}

/// One file in a [`RunDiff`].
///
/// `patch` is the raw unified diff text (`@@ -a,b +c,d @@ ...`). It is
/// `None` for binary files or when [`Self::truncated`] caused the body to
/// be elided (e.g. the patch exceeded the per-file byte cap, or the parent
/// `RunDiff` overflowed the per-run file cap).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub status: FileDiffStatus,
    /// Pre-rename path. Populated only when `status == Renamed`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    pub additions: u32,
    pub deletions: u32,
    pub binary: bool,
    pub truncated: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub patch: Option<String>,
}

/// Read-only snapshot of the changes inside a Run's worktree, scoped from
/// `base_ref` (the merge-base against the workspace default branch) to
/// `head_ref` (current `HEAD` of the worktree).
///
/// The collector caps the response in two dimensions to keep payloads
/// bounded: per-file patches above [`MAX_PATCH_BYTES`] are dropped with
/// `truncated: true`, and once [`MAX_FILES`] is reached subsequent entries
/// carry only metadata. Both bounds live in `superkick-runtime` rather
/// than here so they can be tuned without churning the domain type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunDiff {
    pub base_ref: String,
    pub head_ref: String,
    pub files: Vec<FileDiff>,
    pub file_count: u32,
    pub overflow: bool,
}

impl RunDiff {
    pub fn empty(base_ref: impl Into<String>, head_ref: impl Into<String>) -> Self {
        Self {
            base_ref: base_ref.into(),
            head_ref: head_ref.into(),
            files: Vec::new(),
            file_count: 0,
            overflow: false,
        }
    }
}
