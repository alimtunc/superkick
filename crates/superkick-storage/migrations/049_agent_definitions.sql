-- App-managed, editable agent definitions.
--
-- The six builtins (codex/claude × planner/coder/reviewer) are seeded as
-- editable DB copies of the canonical core constants
-- (`CoreAgentDefinition::builtins`); operators may also author custom agents and
-- `superkick.yaml` `agents:` entries are merged in as custom rows at boot. `name`
-- is a stable slug primary key (no FK), mirroring `skill_definitions.id` and the
-- FK-less `launch_task_steps.agent_name` catalog reference.
--
-- Nested policy fields (mcp_policy, tool_policy, backend) are stored as JSON TEXT
-- because the flat-column approach cannot express their Vec<String> payloads;
-- they round-trip via serde and are not queried in SQL.
CREATE TABLE IF NOT EXISTS agent_definitions (
    name              TEXT PRIMARY KEY NOT NULL,
    provider          TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
    role              TEXT,
    model             TEXT,
    system_prompt     TEXT,
    timeout_secs      INTEGER,
    max_turns         INTEGER,
    origin            TEXT NOT NULL CHECK (origin IN ('builtin', 'custom')),
    linear_context    TEXT NOT NULL CHECK (
        linear_context IN ('none', 'snapshot', 'snapshot_plus_mcp')
    ),
    default_reasoning TEXT NOT NULL CHECK (
        default_reasoning IN ('minimal', 'low', 'medium', 'high', 'xhigh', 'max')
    ),
    runner_mode       TEXT CHECK (
        runner_mode IS NULL OR runner_mode IN (
            'interactive_pty', 'print_stream_json', 'exec_json', 'background_session'
        )
    ),
    billing_profile   TEXT CHECK (
        billing_profile IS NULL OR billing_profile IN (
            'subscription', 'agent_sdk_credits', 'api_credits', 'unknown'
        )
    ),
    mcp_policy_json   TEXT NOT NULL,
    tool_policy_json  TEXT NOT NULL,
    backend_json      TEXT,
    enabled           INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
);
