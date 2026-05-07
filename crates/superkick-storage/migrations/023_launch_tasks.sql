-- SUP-116: launch task aggregate (parent + ordered steps).
--
-- Each attempt to advance a Linear issue is persisted as a `launch_tasks`
-- row plus three ordered `launch_task_steps`. SUP-118 (execution loop) and
-- SUP-117 (launcher UI) read this aggregate. This migration only carves out
-- the schema.
--
-- `current_step_id` is intentionally a plain TEXT column with no SQL FK. The
-- parent and its children are written in a single transaction by
-- `SqliteLaunchTaskRepo::insert_with_steps`, but the child rows must exist
-- before the pointer can be valid, and SQLite does not support deferred FKs
-- without table-wide DEFERRABLE clauses. The application enforces consistency.
--
-- `agent_name` on a step is a free-form string by design. SUP-121 will add
-- repo/user agents that don't necessarily live in any SQL table.

CREATE TABLE IF NOT EXISTS launch_tasks (
    id                 TEXT PRIMARY KEY NOT NULL,
    linear_issue_id    TEXT NOT NULL,
    recipe_kind        TEXT NOT NULL,
    status             TEXT NOT NULL CHECK (
        status IN ('pending', 'running', 'needs_human', 'completed', 'failed', 'cancelled')
    ),
    current_step_id    TEXT,
    summary            TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_launch_tasks_linear_issue_id
    ON launch_tasks(linear_issue_id);
CREATE INDEX IF NOT EXISTS idx_launch_tasks_status
    ON launch_tasks(status);

CREATE TABLE IF NOT EXISTS launch_task_steps (
    id                                TEXT PRIMARY KEY NOT NULL,
    launch_task_id                    TEXT NOT NULL REFERENCES launch_tasks(id) ON DELETE CASCADE,
    sequence                          INTEGER NOT NULL,
    step_kind                         TEXT NOT NULL CHECK (
        step_kind IN ('plan', 'implement', 'review')
    ),
    agent_name                        TEXT NOT NULL,
    provider                          TEXT,
    model                             TEXT,
    mode                              TEXT,
    status                            TEXT NOT NULL CHECK (
        status IN ('pending', 'running', 'completed', 'failed', 'needs_human', 'skipped', 'cancelled')
    ),
    linked_run_id                     TEXT,
    linked_conversation_id            TEXT,
    linked_orchestrator_session_id    TEXT,
    summary                           TEXT,
    created_at                        TEXT NOT NULL,
    updated_at                        TEXT NOT NULL,
    UNIQUE (launch_task_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_launch_task_steps_task_seq
    ON launch_task_steps(launch_task_id, sequence);
