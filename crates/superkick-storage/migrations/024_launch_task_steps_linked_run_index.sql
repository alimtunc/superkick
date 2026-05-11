-- SUP-111 follow-up: index the `linked_run_id` lookup used by `cancel_run`.
--
-- `LaunchTaskRepo::find_step_by_linked_run` scans `launch_task_steps` by
-- `linked_run_id` to bridge "operator cancelled run X" → "cancel the launch
-- task that spawned X". Without an index the query is O(n) on every cancel;
-- with one it's O(log n) and the table can grow without pessimising the
-- API path.

CREATE INDEX IF NOT EXISTS idx_launch_task_steps_linked_run_id
    ON launch_task_steps(linked_run_id);
