-- Enforce at most one active (non-terminal) run per issue at the DB level.
-- This closes a TOCTOU race in the application-level dedup guard.
CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_active_issue
    ON runs(issue_id)
    WHERE state NOT IN ('completed', 'failed', 'cancelled');
