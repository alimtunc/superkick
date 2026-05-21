-- Nullable so legacy rows / clients without overrides inherit runner defaults.

ALTER TABLE launch_tasks ADD COLUMN base_branch TEXT;
ALTER TABLE launch_tasks ADD COLUMN use_worktree INTEGER
    CHECK (use_worktree IN (0, 1));
