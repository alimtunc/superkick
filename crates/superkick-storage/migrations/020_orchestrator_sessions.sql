-- SUP-102: long-running orchestrator session model with compaction checkpoints.
--
-- Two parallel tables. No ALTER on existing tables — the orchestrator session
-- is an aggregate that lives next to runs/handoffs, not their parent. Run
-- linkage is carried inside the checkpoint's `child_run_ids_json` column so
-- the run lifecycle is unaffected by this ticket.

CREATE TABLE IF NOT EXISTS orchestrator_sessions (
    id                     TEXT PRIMARY KEY NOT NULL,
    title                  TEXT NOT NULL,
    provider               TEXT NOT NULL,
    runtime_provider_id    TEXT,
    status                 TEXT NOT NULL,
    owner                  TEXT NOT NULL,
    scope_json             TEXT NOT NULL,
    provider_session_id    TEXT,
    -- Denormalised cache of the freshest checkpoint id. No declared FK on
    -- this column — it would cycle with orchestrator_checkpoints.session_id.
    -- The invariant is upheld by the transactional insert_checkpoint write.
    latest_checkpoint_id   TEXT,
    last_event_cursor      TEXT,
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_sessions_status
    ON orchestrator_sessions(status);

CREATE TABLE IF NOT EXISTS orchestrator_checkpoints (
    id                     TEXT PRIMARY KEY NOT NULL,
    session_id             TEXT NOT NULL REFERENCES orchestrator_sessions(id) ON DELETE CASCADE,
    summary                TEXT NOT NULL,
    covers_from_event      TEXT,
    covers_to_event        TEXT,
    decisions_json         TEXT NOT NULL,
    open_questions_json    TEXT NOT NULL,
    child_run_ids_json     TEXT NOT NULL,
    child_handoff_ids_json TEXT NOT NULL,
    created_at             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_checkpoints_session
    ON orchestrator_checkpoints(session_id);
