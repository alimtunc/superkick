-- SUP-199 — local inline diff review threads.
--
-- This is local-only review state scoped to a run diff. It intentionally has
-- no GitHub review/comment identifiers; GitHub submission/import is out of
-- scope for SUP-199.

CREATE TABLE IF NOT EXISTS diff_review_threads (
    id            TEXT PRIMARY KEY NOT NULL,
    run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    issue_id      TEXT,
    file_path     TEXT NOT NULL CHECK(length(trim(file_path)) > 0),
    old_path      TEXT,
    side          TEXT NOT NULL CHECK(side IN ('old', 'new', 'context')),
    old_line      INTEGER CHECK(old_line IS NULL OR old_line > 0),
    new_line      INTEGER CHECK(new_line IS NULL OR new_line > 0),
    hunk_header   TEXT,
    hunk_index    INTEGER,
    base_ref      TEXT,
    head_ref      TEXT,
    state         TEXT NOT NULL CHECK(state IN ('open', 'resolved')),
    author        TEXT NOT NULL CHECK(length(trim(author)) > 0),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    CHECK (
        (side = 'old' AND old_line IS NOT NULL) OR
        (side = 'new' AND new_line IS NOT NULL) OR
        (side = 'context' AND old_line IS NOT NULL AND new_line IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_diff_review_threads_run
    ON diff_review_threads(run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_diff_review_threads_file
    ON diff_review_threads(run_id, file_path, state);

CREATE TABLE IF NOT EXISTS diff_review_comments (
    id          TEXT PRIMARY KEY NOT NULL,
    thread_id   TEXT NOT NULL REFERENCES diff_review_threads(id) ON DELETE CASCADE,
    author      TEXT NOT NULL CHECK(length(trim(author)) > 0),
    body        TEXT NOT NULL CHECK(length(trim(body)) > 0),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_diff_review_comments_thread
    ON diff_review_comments(thread_id, created_at);

CREATE TABLE IF NOT EXISTS diff_review_file_states (
    run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    issue_id    TEXT,
    file_path   TEXT NOT NULL CHECK(length(trim(file_path)) > 0),
    old_path    TEXT,
    reviewed    INTEGER NOT NULL CHECK(reviewed IN (0, 1)),
    reviewer    TEXT,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (run_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_diff_review_file_states_run
    ON diff_review_file_states(run_id);
