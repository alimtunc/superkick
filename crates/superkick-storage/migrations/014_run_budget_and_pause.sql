-- SUP-72: persist the per-run execution contract (budget) and the structured
-- reason the supervisor paused the run. `budget_json` snapshots the project
-- budget at launch so a mid-flight config change cannot retroactively tighten
-- or widen an in-flight run. `pause_kind` + `pause_reason` let the UI render
-- "Paused — duration exceeded: 1802s / 1800s" without parsing event payloads.
--
-- All three columns default to an empty / none state so pre-existing runs
-- remain valid: `budget_json = '{}'` deserializes to an all-None `RunBudget`
-- (no enforcement), `pause_kind = 'none'` matches the default variant.

ALTER TABLE runs ADD COLUMN budget_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE runs ADD COLUMN pause_kind TEXT NOT NULL DEFAULT 'none';
ALTER TABLE runs ADD COLUMN pause_reason TEXT;
