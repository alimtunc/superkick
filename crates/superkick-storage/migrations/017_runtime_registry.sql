-- SUP-96: runtime registry — model the machines that can execute agent work
-- and the CLI providers (claude, codex, ...) detected on each one.
--
-- V1 only ever materialises a single 'local' runtime. The schema is shaped for
-- multi-runtime so we never have to migrate again when adding remote workers,
-- but the unique partial index pins the invariant: there can be at most one
-- runtime in `mode='local'`. `ensure_local()` relies on that to be idempotent
-- across boots.
--
-- `runtime_providers` is keyed by `(runtime_id, kind)` so detection upserts in
-- place: re-running detection updates `executable_path`, `version`, `status`,
-- and the capability flags rather than accumulating duplicate rows. Capability
-- flags are stored as INTEGER booleans (0/1) — sqlite has no native bool —
-- and the column set matches `RuntimeCapabilities` field-for-field.

CREATE TABLE runtimes (
    id            TEXT PRIMARY KEY NOT NULL,
    name          TEXT NOT NULL,
    mode          TEXT NOT NULL CHECK (mode IN ('local','remote')),
    status        TEXT NOT NULL CHECK (status IN ('online','offline','degraded')),
    host_label    TEXT,
    platform      TEXT,
    arch          TEXT,
    last_seen_at  TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

-- Enforce single local runtime invariant. Future remote runtimes are unique by
-- (mode='remote', host_label) — left for the migration that introduces them.
CREATE UNIQUE INDEX idx_runtimes_single_local
    ON runtimes (mode) WHERE mode = 'local';

CREATE TABLE runtime_providers (
    id                          TEXT PRIMARY KEY NOT NULL,
    runtime_id                  TEXT NOT NULL REFERENCES runtimes(id) ON DELETE CASCADE,
    kind                        TEXT NOT NULL,
    executable_path             TEXT,
    version                     TEXT,
    status                      TEXT NOT NULL CHECK (status IN ('available','unavailable','stale')),
    supports_pty                INTEGER NOT NULL DEFAULT 0,
    supports_protocol           INTEGER NOT NULL DEFAULT 0,
    supports_resume             INTEGER NOT NULL DEFAULT 0,
    supports_mcp_config         INTEGER NOT NULL DEFAULT 0,
    supports_structured_tools   INTEGER NOT NULL DEFAULT 0,
    supports_usage              INTEGER NOT NULL DEFAULT 0,
    last_seen_at                TEXT,
    created_at                  TEXT NOT NULL,
    updated_at                  TEXT NOT NULL,
    UNIQUE (runtime_id, kind)
);

CREATE INDEX idx_runtime_providers_runtime
    ON runtime_providers (runtime_id);
