-- Initial schema for superkick storage layer.
-- All UUIDs stored as TEXT (hyphenated), timestamps as RFC3339 TEXT, enums as snake_case TEXT.

CREATE TABLE IF NOT EXISTS runs (
    id               TEXT PRIMARY KEY NOT NULL,
    issue_id         TEXT NOT NULL,
    issue_identifier TEXT NOT NULL,
    repo_slug        TEXT NOT NULL,
    state            TEXT NOT NULL,
    trigger_source   TEXT NOT NULL,
    current_step_key TEXT,
    base_branch      TEXT NOT NULL,
    worktree_path    TEXT,
    branch_name      TEXT,
    started_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    finished_at      TEXT,
    error_message    TEXT
);

CREATE TABLE IF NOT EXISTS run_steps (
    id             TEXT PRIMARY KEY NOT NULL,
    run_id         TEXT NOT NULL REFERENCES runs(id),
    step_key       TEXT NOT NULL,
    status         TEXT NOT NULL,
    attempt        INTEGER NOT NULL,
    agent_provider TEXT,
    started_at     TEXT,
    finished_at    TEXT,
    input_json     TEXT,
    output_json    TEXT,
    error_message  TEXT
);

CREATE TABLE IF NOT EXISTS run_events (
    id           TEXT PRIMARY KEY NOT NULL,
    run_id       TEXT NOT NULL REFERENCES runs(id),
    run_step_id  TEXT REFERENCES run_steps(id),
    ts           TEXT NOT NULL,
    kind         TEXT NOT NULL,
    level        TEXT NOT NULL,
    message      TEXT NOT NULL,
    payload_json TEXT
);

CREATE TABLE IF NOT EXISTS agent_sessions (
    id          TEXT PRIMARY KEY NOT NULL,
    run_id      TEXT NOT NULL REFERENCES runs(id),
    run_step_id TEXT NOT NULL REFERENCES run_steps(id),
    provider    TEXT NOT NULL,
    command     TEXT NOT NULL,
    pid         INTEGER,
    status      TEXT NOT NULL,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    exit_code   INTEGER
);

CREATE TABLE IF NOT EXISTS interrupts (
    id           TEXT PRIMARY KEY NOT NULL,
    run_id       TEXT NOT NULL REFERENCES runs(id),
    run_step_id  TEXT REFERENCES run_steps(id),
    question     TEXT NOT NULL,
    context_json TEXT,
    status       TEXT NOT NULL,
    answer_json  TEXT,
    created_at   TEXT NOT NULL,
    resolved_at  TEXT
);

CREATE TABLE IF NOT EXISTS artifacts (
    id            TEXT PRIMARY KEY NOT NULL,
    run_id        TEXT NOT NULL REFERENCES runs(id),
    kind          TEXT NOT NULL,
    path_or_url   TEXT NOT NULL,
    metadata_json TEXT,
    created_at    TEXT NOT NULL
);

-- Indexes for common queries.
CREATE INDEX IF NOT EXISTS idx_run_steps_run_id ON run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_run_events_run_id ON run_events(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_run_id ON agent_sessions(run_id);
CREATE INDEX IF NOT EXISTS idx_interrupts_run_id ON interrupts(run_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_run_id ON artifacts(run_id);
