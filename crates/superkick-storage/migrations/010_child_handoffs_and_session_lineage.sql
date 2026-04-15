-- SUP-46: structured handoff contract + child-session lineage.
--
-- Adds lineage columns on agent_sessions (role/purpose/parent/launch_reason/handoff_id)
-- and a new `handoffs` table. Existing rows keep nullable lineage fields — the
-- runtime always sets them going forward.

ALTER TABLE agent_sessions ADD COLUMN role TEXT;
ALTER TABLE agent_sessions ADD COLUMN purpose TEXT;
ALTER TABLE agent_sessions ADD COLUMN parent_session_id TEXT REFERENCES agent_sessions(id);
ALTER TABLE agent_sessions ADD COLUMN launch_reason TEXT;
ALTER TABLE agent_sessions ADD COLUMN handoff_id TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_parent ON agent_sessions(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_handoff ON agent_sessions(handoff_id);

CREATE TABLE IF NOT EXISTS handoffs (
    id              TEXT PRIMARY KEY NOT NULL,
    run_id          TEXT NOT NULL REFERENCES runs(id),
    origin_step_id  TEXT NOT NULL REFERENCES run_steps(id),
    from_session_id TEXT REFERENCES agent_sessions(id),
    to_role         TEXT NOT NULL,
    to_session_id   TEXT REFERENCES agent_sessions(id),
    kind            TEXT NOT NULL,
    payload_json    TEXT NOT NULL,
    status          TEXT NOT NULL,
    result_json     TEXT,
    failure_json    TEXT,
    parent_handoff  TEXT REFERENCES handoffs(id),
    created_at      TEXT NOT NULL,
    delivered_at    TEXT,
    completed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_handoffs_run_id ON handoffs(run_id);
CREATE INDEX IF NOT EXISTS idx_handoffs_status ON handoffs(status);
CREATE INDEX IF NOT EXISTS idx_handoffs_parent ON handoffs(parent_handoff);
