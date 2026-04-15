-- SUP-86: record how Linear context was delivered to each child agent session.
-- NULL means "pre-migration row" — context mode was not tracked at that time.
ALTER TABLE agent_sessions ADD COLUMN linear_context_mode TEXT NULL;
