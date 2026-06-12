-- Per-provider reasoning ranges + the full_session profile kind.
--
-- ReasoningEffort renamed `ultra_code` to `max` and gained `minimal`. SQLite
-- cannot ALTER a CHECK constraint, so the three tables carrying a reasoning
-- CHECK (provider_settings, skill_definitions, launch_profile_steps) are
-- rebuilt create-copy-drop-rename with the new value set, and launch_profiles
-- is rebuilt alongside its steps table so its kind CHECK admits 'full_session'.
-- Stored 'ultra_code' values remap by the row's provider — codex caps at
-- 'xhigh', anything else becomes 'max'. launch_task_steps.reasoning_effort has
-- no CHECK, so a plain UPDATE remaps it in place.
--
-- launch_profile_steps_new references launch_profiles_new while both old
-- tables are dropped, then the renames retarget its FK back to launch_profiles
-- (SQLite rewrites REFERENCES clauses on table rename).

CREATE TABLE IF NOT EXISTS provider_settings_new (
    provider           TEXT PRIMARY KEY NOT NULL CHECK (provider IN ('claude', 'codex')),
    billing_mode       TEXT NOT NULL CHECK (
        billing_mode IN ('subscription', 'agent_sdk_credits', 'api_credits', 'unknown')
    ),
    default_model      TEXT,
    default_reasoning  TEXT NOT NULL CHECK (
        default_reasoning IN ('minimal', 'low', 'medium', 'high', 'xhigh', 'max')
    ),
    default_executor   TEXT NOT NULL CHECK (
        default_executor IN ('codex_structured', 'claude_workflow', 'interactive_pty', 'future')
    ),
    sandbox_policy     TEXT NOT NULL CHECK (
        sandbox_policy IN ('read_only', 'workspace_write', 'danger_full_access')
    ),
    permission_policy  TEXT NOT NULL CHECK (
        permission_policy IN ('prompt', 'accept_edits', 'bypass_permissions')
    ),
    enabled            INTEGER NOT NULL DEFAULT 1,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
);

INSERT INTO provider_settings_new (
    provider, billing_mode, default_model, default_reasoning, default_executor,
    sandbox_policy, permission_policy, enabled, created_at, updated_at
)
SELECT
    provider, billing_mode, default_model,
    CASE
        WHEN default_reasoning = 'ultra_code' AND provider = 'codex' THEN 'xhigh'
        WHEN default_reasoning = 'ultra_code' THEN 'max'
        ELSE default_reasoning
    END,
    default_executor, sandbox_policy, permission_policy, enabled, created_at, updated_at
FROM provider_settings;

DROP TABLE IF EXISTS provider_settings;

ALTER TABLE provider_settings_new RENAME TO provider_settings;

CREATE TABLE IF NOT EXISTS skill_definitions_new (
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
        default_reasoning IN ('minimal', 'low', 'medium', 'high', 'xhigh', 'max')
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

INSERT INTO skill_definitions_new (
    id, label, kind, source_kind, source_value, default_provider, default_model,
    default_reasoning, default_executor, default_session_policy,
    default_output_expectation, enabled, origin, created_at, updated_at
)
SELECT
    id, label, kind, source_kind, source_value, default_provider, default_model,
    CASE
        WHEN default_reasoning = 'ultra_code' AND default_provider = 'codex' THEN 'xhigh'
        WHEN default_reasoning = 'ultra_code' THEN 'max'
        ELSE default_reasoning
    END,
    default_executor, default_session_policy,
    default_output_expectation, enabled, origin, created_at, updated_at
FROM skill_definitions;

DROP TABLE IF EXISTS skill_definitions;

ALTER TABLE skill_definitions_new RENAME TO skill_definitions;

CREATE TABLE IF NOT EXISTS launch_profiles_new (
    id           TEXT PRIMARY KEY NOT NULL,
    name         TEXT NOT NULL,
    kind         TEXT NOT NULL CHECK (
        kind IN (
            'standard', 'fast_fix', 'plan_only', 'implement_only',
            'review_only', 'claude_workflow', 'full_session', 'custom'
        )
    ),
    is_default   INTEGER NOT NULL DEFAULT 0,
    is_readonly  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

INSERT INTO launch_profiles_new (
    id, name, kind, is_default, is_readonly, created_at, updated_at
)
SELECT id, name, kind, is_default, is_readonly, created_at, updated_at
FROM launch_profiles;

CREATE TABLE IF NOT EXISTS launch_profile_steps_new (
    profile_id          TEXT NOT NULL REFERENCES launch_profiles_new(id) ON DELETE CASCADE,
    ordering            INTEGER NOT NULL,
    label               TEXT NOT NULL,
    skill_ref           TEXT NOT NULL,
    provider            TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
    model               TEXT,
    reasoning           TEXT NOT NULL CHECK (
        reasoning IN ('minimal', 'low', 'medium', 'high', 'xhigh', 'max')
    ),
    executor            TEXT NOT NULL CHECK (
        executor IN ('codex_structured', 'claude_workflow', 'interactive_pty', 'future')
    ),
    session_policy      TEXT NOT NULL CHECK (
        session_policy IN ('fresh', 'resume', 'same_session', 'same_workflow', 'takeover')
    ),
    output_expectation  TEXT NOT NULL CHECK (
        output_expectation IN ('plan', 'patch', 'review', 'comment', 'no_op')
    ),
    enabled             INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (profile_id, ordering)
);

INSERT INTO launch_profile_steps_new (
    profile_id, ordering, label, skill_ref, provider, model, reasoning,
    executor, session_policy, output_expectation, enabled
)
SELECT
    profile_id, ordering, label, skill_ref, provider, model,
    CASE
        WHEN reasoning = 'ultra_code' AND provider = 'codex' THEN 'xhigh'
        WHEN reasoning = 'ultra_code' THEN 'max'
        ELSE reasoning
    END,
    executor, session_policy, output_expectation, enabled
FROM launch_profile_steps;

DROP TABLE IF EXISTS launch_profile_steps;

DROP TABLE IF EXISTS launch_profiles;

ALTER TABLE launch_profiles_new RENAME TO launch_profiles;

ALTER TABLE launch_profile_steps_new RENAME TO launch_profile_steps;

UPDATE launch_task_steps
SET reasoning_effort = CASE WHEN provider = 'codex' THEN 'xhigh' ELSE 'max' END
WHERE reasoning_effort = 'ultra_code';

-- Gates claude-skill directives on real (custom) skills; NULL on legacy rows and degraded refs.
ALTER TABLE launch_task_steps ADD COLUMN skill_kind TEXT;
