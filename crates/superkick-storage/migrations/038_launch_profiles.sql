-- Editable launch profiles + their ordered steps.
--
-- The seven builtins are seeded as editable DB copies of the canonical code
-- constants. Steps key by `(profile_id, ordering)` (the composite primary key
-- gives the UNIQUE(profile_id, ordering) the plan calls for). ON DELETE CASCADE
-- drops a profile's steps with it. `id` is a stable string slug for builtins.
CREATE TABLE IF NOT EXISTS launch_profiles (
    id           TEXT PRIMARY KEY NOT NULL,
    name         TEXT NOT NULL,
    kind         TEXT NOT NULL CHECK (
        kind IN (
            'standard', 'fast_fix', 'plan_only', 'implement_only',
            'review_only', 'claude_workflow', 'custom'
        )
    ),
    is_default   INTEGER NOT NULL DEFAULT 0,
    is_readonly  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS launch_profile_steps (
    profile_id          TEXT NOT NULL REFERENCES launch_profiles(id) ON DELETE CASCADE,
    ordering            INTEGER NOT NULL,
    label               TEXT NOT NULL,
    skill_ref           TEXT NOT NULL,
    provider            TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
    model               TEXT,
    reasoning           TEXT NOT NULL CHECK (
        reasoning IN ('low', 'medium', 'high', 'xhigh', 'ultra_code')
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
