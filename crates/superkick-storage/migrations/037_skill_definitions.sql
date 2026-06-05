-- App-managed, editable skill definitions.
--
-- The four builtins (Plan / Implement / Review / Pre-PR Review) are seeded as
-- editable DB copies of the canonical code constants. Operators may also author
-- free-form custom skills. `id` is a stable string slug (no FK), mirroring how
-- `launch_task_steps.agent_name` is a free-form catalog reference.
CREATE TABLE IF NOT EXISTS skill_definitions (
    id                          TEXT PRIMARY KEY NOT NULL,
    label                       TEXT NOT NULL,
    kind                        TEXT NOT NULL CHECK (
        kind IN ('plan', 'implement', 'review', 'pre_pr_review', 'custom')
    ),
    source_kind                 TEXT NOT NULL CHECK (source_kind IN ('installed', 'prompt')),
    source_value                TEXT NOT NULL,
    default_provider            TEXT NOT NULL CHECK (default_provider IN ('claude', 'codex')),
    default_model               TEXT,
    default_reasoning           TEXT NOT NULL CHECK (
        default_reasoning IN ('low', 'medium', 'high', 'xhigh', 'ultra_code')
    ),
    default_executor            TEXT NOT NULL CHECK (
        default_executor IN ('codex_structured', 'claude_workflow', 'interactive_pty', 'future')
    ),
    default_session_policy      TEXT NOT NULL CHECK (
        default_session_policy IN ('fresh', 'resume', 'same_session', 'same_workflow', 'takeover')
    ),
    default_output_expectation  TEXT NOT NULL CHECK (
        default_output_expectation IN ('plan', 'patch', 'review', 'comment', 'no_op')
    ),
    enabled                     INTEGER NOT NULL DEFAULT 1,
    origin                      TEXT NOT NULL CHECK (origin IN ('builtin', 'custom')),
    created_at                  TEXT NOT NULL,
    updated_at                  TEXT NOT NULL
);
