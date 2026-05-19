-- Runtime classifier verdict for non-completed steps. Orthogonal to
-- structured_result (agent self-report). Nullable so legacy rows and
-- successful runs leave it untouched.

ALTER TABLE launch_task_steps ADD COLUMN failure_classification TEXT;
