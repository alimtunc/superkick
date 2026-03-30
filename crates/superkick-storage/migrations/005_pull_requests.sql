-- Pull requests linked to runs, with state tracking for GitHub sync.

CREATE TABLE IF NOT EXISTS pull_requests (
    id           TEXT PRIMARY KEY NOT NULL,
    run_id       TEXT NOT NULL REFERENCES runs(id),
    number       INTEGER NOT NULL,
    repo_slug    TEXT NOT NULL,
    url          TEXT NOT NULL,
    state        TEXT NOT NULL DEFAULT 'open',
    title        TEXT NOT NULL DEFAULT '',
    head_branch  TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    merged_at    TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pull_requests_run_id ON pull_requests(run_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_repo_number ON pull_requests(repo_slug, number);
