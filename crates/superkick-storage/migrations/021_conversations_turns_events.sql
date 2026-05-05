-- SUP-100: structured agent chat turns on issues and runs.
--
-- Sits above the SUP-97/98/99 protocol adapter so the operator can converse
-- with an agent from an issue or run, see streaming structured events
-- (text + tool_use + tool_result + usage), and reload the transcript after
-- a refresh. The PTY path stays untouched (terminal takeover remains the
-- fallback for SUP-100 AC 6).
--
-- Three append-only-ish tables:
--
-- conversations         One per (subject, agent_id, provider). Subject is
--                       polymorphic — exactly one of issue_identifier / run_id
--                       is set. Idempotency key on (subject, agent_id) lets
--                       the API return the same row on repeat opens.
-- conversation_turns    One per send. Holds the user prompt, the lifecycle
--                       status (pending/streaming/completed/failed/cancelled),
--                       and the optional final usage snapshot.
-- turn_events           Append-only stream of `ProtocolEventEnvelope`s,
--                       persisted JSON exactly as emitted. `seq` is the
--                       monotonic per-turn counter the adapter wrote on the
--                       envelope, duplicated as an integer column so SSE
--                       replay can ORDER BY without parsing JSON.
--
-- provider_session_id is duplicated on `conversations` (independent of the
-- existing column on `agent_sessions`) so a structured chat conversation has
-- its own resume key separate from any PTY run-session that may share the
-- same agent.

CREATE TABLE IF NOT EXISTS conversations (
    id                   TEXT PRIMARY KEY NOT NULL,
    -- Exactly one of these is non-null. Enforced by the CHECK below.
    issue_identifier     TEXT,
    run_id               TEXT REFERENCES runs(id),
    agent_id             TEXT NOT NULL,
    provider             TEXT NOT NULL,
    status               TEXT NOT NULL,
    -- Opaque provider-side session/thread id (Claude session_id, Codex
    -- thread_id). NULL until the first SessionMeta event.
    provider_session_id  TEXT,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    last_turn_at         TEXT,
    CHECK (
        (issue_identifier IS NOT NULL AND run_id IS NULL)
        OR (issue_identifier IS NULL AND run_id IS NOT NULL)
    )
);

-- Lookup paths used by the API.
CREATE INDEX IF NOT EXISTS idx_conversations_issue_identifier
    ON conversations(issue_identifier);
CREATE INDEX IF NOT EXISTS idx_conversations_run_id
    ON conversations(run_id);

-- Idempotency: hitting POST /api/conversations twice for the same subject +
-- agent must return the same row. Two partial unique indexes (issue / run
-- variants) cover the polymorphism without a synthetic subject_key column.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_issue_agent
    ON conversations(issue_identifier, agent_id)
    WHERE issue_identifier IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_run_agent
    ON conversations(run_id, agent_id)
    WHERE run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS conversation_turns (
    id              TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    seq             INTEGER NOT NULL,
    user_text       TEXT NOT NULL,
    status          TEXT NOT NULL,
    -- Final usage snapshot when the adapter emits one. JSON shape mirrors
    -- `superkick_core::UsageSnapshot`.
    usage_json      TEXT,
    -- Filled when status transitions to failed.
    error_code      TEXT,
    error_message   TEXT,
    -- Filled when status transitions to cancelled.
    cancel_reason   TEXT,
    created_at      TEXT NOT NULL,
    started_at      TEXT,
    finished_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_conversation_turns_conversation
    ON conversation_turns(conversation_id, seq);

CREATE TABLE IF NOT EXISTS turn_events (
    id           TEXT PRIMARY KEY NOT NULL,
    turn_id      TEXT NOT NULL REFERENCES conversation_turns(id),
    seq          INTEGER NOT NULL,
    at           TEXT NOT NULL,
    kind         TEXT NOT NULL,
    -- Full ProtocolEventEnvelope as JSON. The flattened `kind` is duplicated
    -- in the `kind` column above for cheap filtering / debug queries.
    envelope_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_turn_events_turn
    ON turn_events(turn_id, seq);
-- Replay path is always (turn_id, seq>=last_event_id) so the composite index
-- above is the right shape and no separate index on (turn_id) alone is needed.
