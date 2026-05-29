-- Per-step agent overrides chosen at launch (the operator picked agents in the
-- launch modal). Stored as a JSON object with optional planner/coder/reviewer
-- keys mirroring RunAgentOverrides. An empty object means all-None (use the
-- workflow defaults), so pre-existing runs remain valid.

ALTER TABLE runs ADD COLUMN agent_overrides_json TEXT NOT NULL DEFAULT '{}';
