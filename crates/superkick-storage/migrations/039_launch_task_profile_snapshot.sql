-- Persist the chosen profile + immutable step snapshot on a launch
-- task, and the dynamic-step columns on each step.
--
-- Legacy rows decode as the 3-step recipe: `profile_id` / `profile_snapshot`
-- stay NULL (the runtime reverts to the hardcoded interpretation) and `enabled`
-- backfills to 1 (NOT NULL DEFAULT 1) so every existing step keeps running.
-- The nullable enum columns backfill to NULL, which the codec reads back as the
-- legacy step shape.
ALTER TABLE launch_tasks ADD COLUMN profile_id TEXT;
ALTER TABLE launch_tasks ADD COLUMN profile_snapshot TEXT;

ALTER TABLE launch_task_steps ADD COLUMN label TEXT;
ALTER TABLE launch_task_steps ADD COLUMN skill_source_kind TEXT;
ALTER TABLE launch_task_steps ADD COLUMN skill_source_value TEXT;
ALTER TABLE launch_task_steps ADD COLUMN reasoning_effort TEXT;
ALTER TABLE launch_task_steps ADD COLUMN executor TEXT;
ALTER TABLE launch_task_steps ADD COLUMN session_policy TEXT;
ALTER TABLE launch_task_steps ADD COLUMN output_expectation TEXT;
ALTER TABLE launch_task_steps ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
