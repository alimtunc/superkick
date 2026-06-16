-- Tombstones for permanently deleted builtin agents/skills.
--
-- `seed_defaults` re-inserts any builtin whose key is absent on every boot, so a
-- raw row delete would reappear on the next start. Recording a tombstone here
-- lets the operator hard-delete a shipped builtin for good: the seeder skips any
-- key present in this table. Restoring a builtin (or re-creating a custom one
-- under the same key) clears its tombstone.
CREATE TABLE IF NOT EXISTS builtin_deletions (
    kind       TEXT NOT NULL CHECK (kind IN ('agent', 'skill')),
    key        TEXT NOT NULL,
    deleted_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (kind, key)
);
