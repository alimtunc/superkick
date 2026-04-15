-- SUP-48: session ownership model.
--
-- Adds orchestration-ownership columns on agent_sessions (current state) plus
-- a dedicated audit table. `ownership_state` defaults to 'orchestrator' so
-- legacy rows reflect the implicit-orchestrator model that predates this
-- migration. The audit table is the source of truth for transitions, and the
-- columns on agent_sessions are a denormalised snapshot for cheap reads.

ALTER TABLE agent_sessions ADD COLUMN ownership_state TEXT NOT NULL DEFAULT 'orchestrator';
ALTER TABLE agent_sessions ADD COLUMN ownership_operator_id TEXT;
ALTER TABLE agent_sessions ADD COLUMN ownership_note TEXT;
ALTER TABLE agent_sessions ADD COLUMN ownership_suspend_json TEXT;
ALTER TABLE agent_sessions ADD COLUMN ownership_since TEXT;

CREATE TABLE IF NOT EXISTS session_ownership_events (
    id              TEXT PRIMARY KEY NOT NULL,
    run_id          TEXT NOT NULL REFERENCES runs(id),
    session_id      TEXT NOT NULL REFERENCES agent_sessions(id),
    from_state      TEXT,
    from_json       TEXT,
    to_state        TEXT NOT NULL,
    to_json         TEXT NOT NULL,
    reason          TEXT NOT NULL,
    operator_id     TEXT,
    created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ownership_events_session
    ON session_ownership_events(session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ownership_events_run
    ON session_ownership_events(run_id, created_at);
