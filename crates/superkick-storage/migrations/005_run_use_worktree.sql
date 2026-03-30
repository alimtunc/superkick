-- Add per-run worktree override flag (defaults to true for existing runs).
ALTER TABLE runs ADD COLUMN use_worktree BOOLEAN NOT NULL DEFAULT 1;
