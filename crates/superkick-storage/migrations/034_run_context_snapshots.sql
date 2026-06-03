-- SUP-187 -- RunContextSnapshot v0 persistence: one regenerable cache row per
-- launch task (PK), replaced wholesale on regeneration. Not a source of truth,
-- so there is no FK on launch_task_id. See the ADR
-- docs/adr/SUP-187-run-context-snapshot.md for rationale.
--
-- NOTE: the migration runner splits this file on the semicolon character, so
-- comments here must never contain one.
CREATE TABLE IF NOT EXISTS run_context_snapshots (
    launch_task_id TEXT PRIMARY KEY NOT NULL,
    version        INTEGER NOT NULL,
    generated_at   TEXT NOT NULL,
    snapshot_json  TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);
