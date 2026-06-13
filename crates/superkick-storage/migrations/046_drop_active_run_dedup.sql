-- Allow more than one active run per issue.
--
-- The operator decides whether to launch a second run on an issue that already
-- has one in flight — the UI warns, it must not hard-block (the single-active
-- guard was producing a dead-end when a parked run sat non-terminal). Concurrent
-- runs on one issue do not collide: each run gets a run-id-scoped branch
-- (`superkick/<issue>-<runid>`) and its own worktree.
--
-- Drops the partial unique index added in 003/004. The launch-task shadow-run
-- insert goes straight through `run_repo.insert`, so removing the index is what
-- actually unblocks a second run; the API-level guard is relaxed alongside.
DROP INDEX IF EXISTS idx_runs_active_issue_identifier;
DROP INDEX IF EXISTS idx_runs_active_issue;
