-- SUP-79: observable session lifecycle audit trail.
--
-- Every time the orchestrator runtime emits a `SessionLifecycleEvent` (a
-- session transitioning to Spawning/Running/Completed/Failed/Cancelled/TimedOut)
-- a row is appended here. The table is append-only — status on
-- `agent_sessions` remains the current denormalised view, this is the ordered
-- history that makes spawn-and-observe decisions auditable.
--
-- Lineage columns are denormalised on purpose so observers can filter by run
-- or by parent without joining back to `agent_sessions`.

CREATE TABLE IF NOT EXISTS session_lifecycle_events (
    id                   TEXT PRIMARY KEY NOT NULL,
    session_id           TEXT NOT NULL REFERENCES agent_sessions(id),
    run_id               TEXT NOT NULL REFERENCES runs(id),
    step_id              TEXT NOT NULL REFERENCES run_steps(id),
    role                 TEXT,
    parent_session_id    TEXT REFERENCES agent_sessions(id),
    launch_reason        TEXT,
    handoff_id           TEXT,
    phase_tag            TEXT NOT NULL,
    phase_json           TEXT NOT NULL,
    ts                   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_lifecycle_events_session
    ON session_lifecycle_events(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_session_lifecycle_events_run
    ON session_lifecycle_events(run_id, ts);
CREATE INDEX IF NOT EXISTS idx_session_lifecycle_events_parent
    ON session_lifecycle_events(parent_session_id);
