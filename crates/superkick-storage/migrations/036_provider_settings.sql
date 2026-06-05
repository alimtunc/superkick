-- App-managed provider settings.
--
-- One editable row per provider. Stores only the configurable fields. The
-- detection-derived availability / install / auth state is overlaid live from
-- the runtime detector at read time and never persisted here. `seed_defaults`
-- writes the builtin Codex/Claude rows idempotently (insert-if-absent), so a
-- factory reset re-seeds while operator edits survive a reboot.
CREATE TABLE IF NOT EXISTS provider_settings (
    provider           TEXT PRIMARY KEY NOT NULL CHECK (provider IN ('claude', 'codex')),
    billing_mode       TEXT NOT NULL CHECK (
        billing_mode IN ('subscription', 'agent_sdk_credits', 'api_credits', 'unknown')
    ),
    default_model      TEXT,
    default_reasoning  TEXT NOT NULL CHECK (
        default_reasoning IN ('low', 'medium', 'high', 'xhigh', 'ultra_code')
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
