-- SUP-147: issue workspace context aggregate (parent + comment excerpts + links).
--
-- Foundation layer for the SUP-145 umbrella. Each row in
-- `issue_workspace_contexts` is one operator-owned workspace attached to a
-- Linear issue. The row owns a frozen snapshot of the issue, plus child
-- tables for selected comment excerpts and links to spawned Launch Tasks,
-- runs, and conversations.
--
-- The snapshot columns (snapshot_title, snapshot_body_md, snapshot_status_name,
-- captured_at) are immutable post-insert by application contract --
-- `IssueWorkspaceContext` exposes no mutator for them. We do not bolt a CHECK
-- constraint on at the SQL level. The aggregate is the single writer and
-- tests assert the invariant.
--
-- Polymorphic link target -- `target_id` is plain TEXT without an FK, matching
-- the precedent set by `launch_task_steps.linked_run_id` (SUP-121). The
-- domain owns the (kind, target_id) pair, and cross-aggregate integrity is
-- the caller's responsibility.

CREATE TABLE IF NOT EXISTS issue_workspace_contexts (
    id                       TEXT PRIMARY KEY NOT NULL,
    linear_team_key          TEXT NOT NULL,
    linear_issue_identifier  TEXT NOT NULL,
    linear_issue_id          TEXT NOT NULL,
    snapshot_title           TEXT NOT NULL,
    snapshot_body_md         TEXT NOT NULL,
    snapshot_status_name     TEXT NOT NULL,
    captured_at              TEXT NOT NULL,
    memory_ledger_pointer    TEXT,
    created_at               TEXT NOT NULL,
    updated_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_issue_workspace_contexts_linear_issue_identifier
    ON issue_workspace_contexts(linear_issue_identifier);
CREATE INDEX IF NOT EXISTS idx_issue_workspace_contexts_linear_issue_id
    ON issue_workspace_contexts(linear_issue_id);

CREATE TABLE IF NOT EXISTS issue_workspace_context_comment_excerpts (
    id                      TEXT PRIMARY KEY NOT NULL,
    workspace_context_id    TEXT NOT NULL REFERENCES issue_workspace_contexts(id) ON DELETE CASCADE,
    linear_comment_id       TEXT NOT NULL,
    author                  TEXT,
    body_md                 TEXT NOT NULL,
    captured_at             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_issue_workspace_context_comment_excerpts_workspace
    ON issue_workspace_context_comment_excerpts(workspace_context_id);

CREATE TABLE IF NOT EXISTS issue_workspace_context_links (
    id                      TEXT PRIMARY KEY NOT NULL,
    workspace_context_id    TEXT NOT NULL REFERENCES issue_workspace_contexts(id) ON DELETE CASCADE,
    link_kind               TEXT NOT NULL CHECK (
        link_kind IN ('launch_task', 'run', 'conversation')
    ),
    target_id               TEXT NOT NULL,
    attached_at             TEXT NOT NULL,
    UNIQUE (workspace_context_id, link_kind, target_id)
);

CREATE INDEX IF NOT EXISTS idx_issue_workspace_context_links_workspace
    ON issue_workspace_context_links(workspace_context_id);
