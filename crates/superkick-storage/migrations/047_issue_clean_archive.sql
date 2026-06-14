-- Issue "clean" support: stats-safe archive of runs + launch tasks.
--
-- `archived_at` is a nullable RFC3339 timestamp. NULL means "live" (shows in
-- the issue feed); a set value means the row was archived out of the feed but
-- is retained for stats/history. The destructive purge path hard-deletes
-- instead of stamping this column.

ALTER TABLE runs ADD COLUMN archived_at TEXT;
ALTER TABLE launch_tasks ADD COLUMN archived_at TEXT;

CREATE INDEX IF NOT EXISTS idx_runs_archived_at ON runs(archived_at);
CREATE INDEX IF NOT EXISTS idx_launch_tasks_archived_at ON launch_tasks(archived_at);
