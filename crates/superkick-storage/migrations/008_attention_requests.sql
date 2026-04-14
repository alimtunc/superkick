-- Structured attention requests raised by active runs for human arbitration.
-- Distinct from `interrupts` (engine-internal step blockers) — these are a
-- product-level coordination layer above the PTY terminal substrate.

CREATE TABLE IF NOT EXISTS attention_requests (
    id            TEXT PRIMARY KEY NOT NULL,
    run_id        TEXT NOT NULL REFERENCES runs(id),
    kind          TEXT NOT NULL,          -- 'clarification' | 'decision' | 'approval'
    title         TEXT NOT NULL,
    body          TEXT NOT NULL,
    options_json  TEXT,                   -- Decision: JSON array of choice strings
    status        TEXT NOT NULL,          -- 'pending' | 'replied' | 'cancelled'
    reply_json    TEXT,                   -- Structured reply payload
    replied_by    TEXT,                   -- Operator identifier (free-form)
    created_at    TEXT NOT NULL,
    replied_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_attention_requests_run_id ON attention_requests(run_id);
CREATE INDEX IF NOT EXISTS idx_attention_requests_status ON attention_requests(status);
