-- SUP-73: heartbeat-driven recovery scheduler.
--
-- runs.last_heartbeat_at is updated by the runtime every time a session
-- lifecycle event lands for an active run. The recovery scheduler reads it
-- alongside runs.updated_at to classify runs as healthy or stalled. It
-- never writes to runs -- only the heartbeat listener does. Default NULL
-- so pre-existing runs surface as "no heartbeat yet" until they next emit
-- one.
--
-- run_recovery_events is the audit trail of every Healthy-to-Stalled
-- transition the scheduler observed. The natural-key UNIQUE on
-- (run_id, kind, detected_at) defends against double-insertion if a tick
-- retries on a transient sqlite error -- the scheduler additionally dedupes
-- by (run_id, kind) against the most-recent row before inserting, so the
-- same Healthy-to-Stalled cause does not re-emit while the state holds.
--
-- The CHECK constraint pins the schema-level invariant: stalled rows carry
-- a reason JSON + the classifier since timestamp, recovered rows carry
-- neither. The dashboard reads stalled_since to render "stalled for Y
-- minutes" using the time the run actually went silent, not the time the
-- scheduler first noticed.

ALTER TABLE runs ADD COLUMN last_heartbeat_at TEXT;

CREATE TABLE run_recovery_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    kind          TEXT NOT NULL CHECK (kind IN ('stalled','recovered')),
    reason        TEXT NOT NULL,
    stalled_since TEXT,
    detected_at   TEXT NOT NULL,
    UNIQUE(run_id, kind, detected_at),
    CHECK (
        (kind = 'stalled'   AND reason != '' AND stalled_since IS NOT NULL)
     OR (kind = 'recovered' AND reason  = '' AND stalled_since IS NULL)
    )
);

CREATE INDEX idx_run_recovery_events_run_detected
    ON run_recovery_events (run_id, detected_at DESC);
