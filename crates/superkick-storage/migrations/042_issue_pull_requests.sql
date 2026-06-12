-- Issue-level pull requests discovered from Linear/GitHub, independent of
-- Superkick runs. Diff files are cached by head_sha so issue detail can show
-- PR diffs without refetching unchanged heads.

CREATE TABLE IF NOT EXISTS issue_pull_requests (
    issue_identifier TEXT NOT NULL,
    issue_id         TEXT NOT NULL,
    repo_slug        TEXT NOT NULL,
    number           INTEGER NOT NULL,
    url              TEXT NOT NULL,
    state            TEXT NOT NULL CHECK(state IN ('open', 'draft', 'merged', 'closed')),
    title            TEXT NOT NULL,
    head_branch      TEXT NOT NULL,
    head_sha         TEXT NOT NULL,
    base_branch      TEXT NOT NULL,
    source           TEXT NOT NULL CHECK(source IN ('linear_attachment', 'github_search', 'manual')),
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    merged_at        TEXT,
    synced_at        TEXT NOT NULL,
    PRIMARY KEY (issue_identifier, repo_slug, number)
);

CREATE INDEX IF NOT EXISTS idx_issue_pull_requests_issue
    ON issue_pull_requests(issue_identifier, updated_at DESC);

CREATE TABLE IF NOT EXISTS issue_pull_request_files (
    issue_identifier TEXT NOT NULL,
    repo_slug        TEXT NOT NULL,
    number           INTEGER NOT NULL,
    head_sha         TEXT NOT NULL,
    path             TEXT NOT NULL,
    old_path         TEXT,
    status           TEXT NOT NULL CHECK(status IN ('added', 'modified', 'removed', 'renamed', 'changed', 'unchanged')),
    additions        INTEGER NOT NULL CHECK(additions >= 0),
    deletions        INTEGER NOT NULL CHECK(deletions >= 0),
    patch            TEXT,
    position         INTEGER NOT NULL CHECK(position >= 0),
    PRIMARY KEY (issue_identifier, repo_slug, number, head_sha, path),
    FOREIGN KEY (issue_identifier, repo_slug, number)
        REFERENCES issue_pull_requests(issue_identifier, repo_slug, number)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_issue_pull_request_files_lookup
    ON issue_pull_request_files(issue_identifier, repo_slug, number, head_sha, position);
