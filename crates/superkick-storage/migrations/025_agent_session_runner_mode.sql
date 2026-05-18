-- Nullable for backfill: pre-migration rows carry NULL and the API
-- treats NULL as "unknown". Values use the audit tags from
-- `superkick_core::RunnerMode` / `BillingProfile`.

ALTER TABLE agent_sessions ADD COLUMN runner_mode TEXT NULL;
ALTER TABLE agent_sessions ADD COLUMN billing_profile TEXT NULL;
