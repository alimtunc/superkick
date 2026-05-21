//! SUP-137 — canonical V1 release-validation issue.
//!
//! The harness in `tests/release_validation.rs` drives this single issue
//! through the full V1 recipe end-to-end. Keep this file in lock-step with
//! `docs/release/test-issue.md` — the markdown there is the Linear
//! template the operator pastes; the Rust below is what the harness sees
//! without going through Linear. Both files exist on purpose: the harness
//! must never depend on Linear's network surface to validate a release.

use anyhow::Result;
use superkick_core::{
    IssueWorkspaceContext, IssueWorkspaceContextCommentExcerpt, IssueWorkspaceContextLink,
    IssueWorkspaceContextSnapshot, LaunchTask, LaunchTaskStep,
};
use superkick_runtime::test_support::{agents, catalog};

/// Canonical Linear identifier used end-to-end in the harness. Sentinel-
/// shaped (`TEAM-`) so a grep across the repo for this string only hits this
/// file and the matching markdown doc.
pub const LINEAR_ISSUE_ID: &str = "TEAM-V1-RELEASE";

/// Linear team key for the sentinel issue. Independent of any real
/// team — picked so the harness can talk through repos that enforce a
/// team-key constraint without leaking into real Linear data.
pub const LINEAR_TEAM_KEY: &str = "TEAM";

/// Title the agent sees on the canonical issue. Kept terse so the prompt
/// stays focused on the deterministic ask in `BODY_MD` below.
pub const ISSUE_TITLE: &str = "Add a pub fn hello() -> &'static str";

/// Issue body fed into the Plan/Implement prompts. The ask is deliberately
/// small and structural so assertions can sit on bus events + `git status`
/// diff size rather than on generated text content.
pub const BODY_MD: &str = r#"## Goal

Add a tiny, deterministic Rust function to the canonical-test-issue repo so
the V1 launch-task recipe has something predictable to plan, implement, and
review.

## Task

1. Edit `src/lib.rs` in the worktree.
2. Add `pub fn hello() -> &'static str { "world" }` at the bottom of the
   file.
3. Do not introduce other changes.

## Acceptance

- The file diff contains exactly one added function.
- The plan summarises the change in one sentence.
- The review confirms the diff matches the task description.
"#;

/// Build the canonical launch task + ordered step list, ready to be inserted
/// into a `SqliteLaunchTaskRepo` via `insert_with_steps`. Uses the shared
/// `superkick_runtime::test_support::catalog` so the three agent roles match
/// the names the executor / runner expect.
pub fn canonical_launch_task() -> Result<(LaunchTask, Vec<LaunchTaskStep>)> {
    let (task, steps) = LaunchTask::new_with_v1_recipe(LINEAR_ISSUE_ID, agents(), &catalog())?;
    Ok((task, steps))
}

/// Build the workspace-context aggregate the harness pre-seeds before the
/// runner asks the IssueWorkspaceContext repo for prompt context. Mirrors
/// what a real Linear → Superkick attach would produce, minus the live
/// fetch.
pub fn canonical_issue_workspace_context() -> Result<(
    IssueWorkspaceContext,
    Vec<IssueWorkspaceContextCommentExcerpt>,
    Vec<IssueWorkspaceContextLink>,
)> {
    let snapshot = IssueWorkspaceContextSnapshot {
        linear_team_key: LINEAR_TEAM_KEY.into(),
        linear_issue_identifier: LINEAR_ISSUE_ID.into(),
        linear_issue_id: LINEAR_ISSUE_ID.into(),
        snapshot_title: ISSUE_TITLE.into(),
        snapshot_body_md: BODY_MD.into(),
        snapshot_status_name: "In Progress".into(),
    };
    let (ctx, excerpts, links) = IssueWorkspaceContext::new(snapshot, Vec::new(), Vec::new())?;
    Ok((ctx, excerpts, links))
}
