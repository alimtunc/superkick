-- SUP-154 — operator interventions persisted per Launch Task.
--
-- An intervention is a free-text request the operator leaves for a running
-- Launch Task. Surfaced to the agent at the next prompt injection point and
-- stamped `consumed_at` once the next step actually starts. Sibling to
-- `attention_requests` (run-scoped, structured) but deliberately distinct.
-- Interventions are launch-task-scoped, fire-and-forget, and free-form.
--
-- `target_step_id` is a plain TEXT column with no SQL FK, same pattern as
-- `launch_tasks.current_step_id` (023_launch_tasks.sql). The application
-- enforces the link.
--
-- Migration is additive only.

CREATE TABLE IF NOT EXISTS launch_task_interventions (
    id              TEXT PRIMARY KEY NOT NULL,
    launch_task_id  TEXT NOT NULL REFERENCES launch_tasks(id) ON DELETE CASCADE,
    target_step_id  TEXT,
    author          TEXT NOT NULL,
    body            TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    consumed_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_launch_task_interventions_task
    ON launch_task_interventions(launch_task_id);

-- Partial index speeds up the executor per-step undelivered scan. Only
-- pending rows are indexed so it stays compact after long-lived tasks.
CREATE INDEX IF NOT EXISTS idx_launch_task_interventions_pending
    ON launch_task_interventions(launch_task_id, consumed_at)
    WHERE consumed_at IS NULL;
