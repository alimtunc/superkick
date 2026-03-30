-- Deduplicate active runs on the stable issue identifier so UI and CLI launches
-- share the same guard even when only the identifier is known.
DROP INDEX IF EXISTS idx_runs_active_issue;

CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_active_issue_identifier
    ON runs(issue_identifier)
    WHERE state NOT IN ('completed', 'failed', 'cancelled');
