-- SUP-148: append-only memory entries scoped to an IssueWorkspaceContext.
--
-- Each row is one durable observation, decision, or note attached to a
-- workspace context (SUP-147). The aggregate keeps an opaque
-- memory_ledger_pointer column reserved for a future cross-tenant ledger.
-- This table is the local FK-anchored journal used by Launch Task steps and
-- chat surfaces.
--
-- Append-only by application contract -- the storage layer exposes append
-- and list_page only, no UPDATE / DELETE paths. The composite index
-- supports cursor-based newest-first pagination (created_at DESC, id DESC).
-- The row-value comparison in the page query reads it directly without a
-- temporary sort.

CREATE TABLE IF NOT EXISTS memory_entries (
    id          TEXT PRIMARY KEY NOT NULL,
    context_id  TEXT NOT NULL REFERENCES issue_workspace_contexts(id) ON DELETE CASCADE,
    author      TEXT,
    role        TEXT NOT NULL,
    text        TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_entries_context_created_id
    ON memory_entries(context_id, created_at DESC, id DESC);
