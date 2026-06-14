-- Nullable: only set when the operator opts to reuse an issue's surviving
-- finished worktree instead of minting a fresh one for the run.

ALTER TABLE launch_tasks ADD COLUMN reuse_worktree_path TEXT;
ALTER TABLE launch_tasks ADD COLUMN reuse_worktree_branch TEXT;
