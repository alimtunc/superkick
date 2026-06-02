-- SUP-185: deterministic per-run ordering for run_events replay / backfill.
--
-- run_events previously ordered by `ts`, which is unstable when two events
-- share a timestamp (lifecycle + structured provider events interleave on the
-- same shadow run under load). Add a monotonic per-run `seq`, allocated by the
-- storage layer at insert time. Existing rows are backfilled in (ts, id) order
-- so historical runs keep a stable, reproducible order.
--
-- NB: the migration runner splits this file on the semicolon character, so each
-- statement must be a single terminated statement and no comment may contain a
-- semicolon (it would split the comment mid-line and produce invalid SQL).

ALTER TABLE run_events ADD COLUMN seq INTEGER;

UPDATE run_events SET seq = (
    SELECT COUNT(*)
    FROM run_events AS prior
    WHERE prior.run_id = run_events.run_id
      AND (prior.ts < run_events.ts
           OR (prior.ts = run_events.ts AND prior.id <= run_events.id))
);

CREATE INDEX IF NOT EXISTS idx_run_events_run_seq ON run_events(run_id, seq);
