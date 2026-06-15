-- SUP-205 — generalize local diff review from run-only to a polymorphic subject.
--
-- 040/041 pinned reviews to a run: a NOT NULL run_id FK on diff_review_threads
-- and a (run_id, file_path) primary key on diff_review_file_states. PR review
-- (SUP-205) needs a subject with no run, so the two tables are rebuilt
-- create-copy-drop-rename (SQLite cannot relax NOT NULL / change a PK in place)
-- and gain:
--   subject_type        'run' | 'pull_request'
--   subject_id          canonical NOT NULL key (run uuid, or 'pr:{repo}#{number}')
--   subject_repo_slug / subject_pr_number / subject_head_sha  (PR subjects only)
-- run_id stays as a NULLABLE FK so run reviews keep their ON DELETE CASCADE.
-- Existing rows backfill to subject_type='run', subject_id=run_id.
--
-- diff_review_comments is rebuilt alongside its parent so its FK retargets the
-- new threads table on rename (same parent+child rename dance as migration 043).

CREATE TABLE IF NOT EXISTS diff_review_threads_new (
    id                TEXT PRIMARY KEY NOT NULL,
    subject_type      TEXT NOT NULL DEFAULT 'run' CHECK(subject_type IN ('run', 'pull_request')),
    subject_id        TEXT NOT NULL CHECK(length(trim(subject_id)) > 0),
    run_id            TEXT REFERENCES runs(id) ON DELETE CASCADE,
    subject_repo_slug TEXT,
    subject_pr_number INTEGER,
    subject_head_sha  TEXT,
    issue_id          TEXT,
    file_path         TEXT NOT NULL CHECK(length(trim(file_path)) > 0),
    old_path          TEXT,
    side              TEXT NOT NULL CHECK(side IN ('old', 'new', 'context')),
    old_line          INTEGER CHECK(old_line IS NULL OR old_line > 0),
    old_line_end      INTEGER CHECK(old_line_end IS NULL OR old_line_end > 0),
    new_line          INTEGER CHECK(new_line IS NULL OR new_line > 0),
    new_line_end      INTEGER CHECK(new_line_end IS NULL OR new_line_end > 0),
    hunk_header       TEXT,
    hunk_index        INTEGER,
    base_ref          TEXT,
    head_ref          TEXT,
    state             TEXT NOT NULL CHECK(state IN ('open', 'resolved')),
    author            TEXT NOT NULL CHECK(length(trim(author)) > 0),
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    CHECK (
        (subject_type = 'run' AND run_id IS NOT NULL) OR
        (subject_type = 'pull_request' AND subject_repo_slug IS NOT NULL AND subject_pr_number IS NOT NULL)
    ),
    CHECK (
        (side = 'old' AND old_line IS NOT NULL) OR
        (side = 'new' AND new_line IS NOT NULL) OR
        (side = 'context' AND old_line IS NOT NULL AND new_line IS NOT NULL)
    )
);

INSERT INTO diff_review_threads_new (
    id, subject_type, subject_id, run_id, subject_repo_slug, subject_pr_number,
    subject_head_sha, issue_id, file_path, old_path, side, old_line, old_line_end,
    new_line, new_line_end, hunk_header, hunk_index, base_ref, head_ref, state,
    author, created_at, updated_at
)
SELECT
    id, 'run', run_id, run_id, NULL, NULL,
    NULL, issue_id, file_path, old_path, side, old_line, old_line_end,
    new_line, new_line_end, hunk_header, hunk_index, base_ref, head_ref, state,
    author, created_at, updated_at
FROM diff_review_threads;

CREATE TABLE IF NOT EXISTS diff_review_comments_new (
    id          TEXT PRIMARY KEY NOT NULL,
    thread_id   TEXT NOT NULL REFERENCES diff_review_threads_new(id) ON DELETE CASCADE,
    author      TEXT NOT NULL CHECK(length(trim(author)) > 0),
    body        TEXT NOT NULL CHECK(length(trim(body)) > 0),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

INSERT INTO diff_review_comments_new (id, thread_id, author, body, created_at, updated_at)
SELECT id, thread_id, author, body, created_at, updated_at FROM diff_review_comments;

DROP TABLE diff_review_comments;
DROP TABLE diff_review_threads;

ALTER TABLE diff_review_threads_new RENAME TO diff_review_threads;
ALTER TABLE diff_review_comments_new RENAME TO diff_review_comments;

CREATE INDEX IF NOT EXISTS idx_diff_review_threads_subject
    ON diff_review_threads(subject_type, subject_id, created_at);

CREATE INDEX IF NOT EXISTS idx_diff_review_threads_file
    ON diff_review_threads(subject_type, subject_id, file_path, state);

CREATE INDEX IF NOT EXISTS idx_diff_review_comments_thread
    ON diff_review_comments(thread_id, created_at);

CREATE TABLE IF NOT EXISTS diff_review_file_states_new (
    subject_type      TEXT NOT NULL DEFAULT 'run' CHECK(subject_type IN ('run', 'pull_request')),
    subject_id        TEXT NOT NULL CHECK(length(trim(subject_id)) > 0),
    run_id            TEXT REFERENCES runs(id) ON DELETE CASCADE,
    subject_repo_slug TEXT,
    subject_pr_number INTEGER,
    subject_head_sha  TEXT,
    issue_id          TEXT,
    file_path         TEXT NOT NULL CHECK(length(trim(file_path)) > 0),
    old_path          TEXT,
    reviewed          INTEGER NOT NULL CHECK(reviewed IN (0, 1)),
    reviewer          TEXT,
    updated_at        TEXT NOT NULL,
    PRIMARY KEY (subject_id, file_path),
    CHECK (
        (subject_type = 'run' AND run_id IS NOT NULL) OR
        (subject_type = 'pull_request' AND subject_repo_slug IS NOT NULL AND subject_pr_number IS NOT NULL)
    )
);

INSERT INTO diff_review_file_states_new (
    subject_type, subject_id, run_id, subject_repo_slug, subject_pr_number,
    subject_head_sha, issue_id, file_path, old_path, reviewed, reviewer, updated_at
)
SELECT
    'run', run_id, run_id, NULL, NULL,
    NULL, issue_id, file_path, old_path, reviewed, reviewer, updated_at
FROM diff_review_file_states;

DROP TABLE diff_review_file_states;

ALTER TABLE diff_review_file_states_new RENAME TO diff_review_file_states;

CREATE INDEX IF NOT EXISTS idx_diff_review_file_states_subject
    ON diff_review_file_states(subject_type, subject_id);
