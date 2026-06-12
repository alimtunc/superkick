-- File-backed managed skills: markdown body + materialisation target.
--
-- `body` holds the skill's markdown (materialised into the worktree at launch;
-- NULL for pure Installed/Prompt skills). `artifact_kind` picks the on-disk
-- shape ('skill' → .claude/skills/<name>/SKILL.md, 'command' → .claude/commands/<name>.md).
--
-- `origin` gained 'imported' (discovered in a configured import dir). SQLite
-- cannot ALTER a CHECK constraint, so the table is rebuilt create-copy-drop-rename
-- (matching migration 040's style) to widen the origin CHECK and add the two
-- new columns in one shot.

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
    origin                      TEXT NOT NULL CHECK (origin IN ('builtin', 'custom', 'imported')),
    body                        TEXT,
    artifact_kind               TEXT NOT NULL DEFAULT 'skill' CHECK (
        artifact_kind IN ('skill', 'command')
    ),
    created_at                  TEXT NOT NULL,
    updated_at                  TEXT NOT NULL
);

INSERT INTO skill_definitions_new (
    id, label, kind, source_kind, source_value, default_provider, default_model,
    default_reasoning, default_executor, default_session_policy,
    default_output_expectation, enabled, origin, body, artifact_kind,
    created_at, updated_at
)
SELECT
    id, label, kind, source_kind, source_value, default_provider, default_model,
    default_reasoning, default_executor, default_session_policy,
    default_output_expectation, enabled, origin, NULL, 'skill',
    created_at, updated_at
FROM skill_definitions;

DROP TABLE IF EXISTS skill_definitions;

ALTER TABLE skill_definitions_new RENAME TO skill_definitions;
