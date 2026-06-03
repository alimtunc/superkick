-- SUP-191: per-step auto-resume bookkeeping for timed-out Codex segments.
-- auto_resume_count tracks how many codex exec resume attempts a step has spent.
-- resume_key stores the Codex thread_id captured at the last timeout so an
-- operator retry can resume the same conversation instead of starting fresh.
ALTER TABLE launch_task_steps ADD COLUMN auto_resume_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE launch_task_steps ADD COLUMN resume_key TEXT;
