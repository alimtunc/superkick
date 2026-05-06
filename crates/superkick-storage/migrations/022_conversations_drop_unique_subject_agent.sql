-- SUP-107: allow multiple chat conversations per (subject, agent_id).
--
-- The unique partial indexes from migration 021 enforced "one conversation
-- per (issue_identifier, agent_id)" and "one conversation per (run_id,
-- agent_id)", which collapsed every operator chat session into the same
-- thread. Drop them so the multi-conversation sidebar can list multiple
-- chats side-by-side.
--
-- The non-unique single-column indexes from 021 (idx_conversations_issue_
-- identifier, idx_conversations_run_id) covered the predicate but not the
-- new `ORDER BY created_at ASC` the sidebar relies on, so the planner had
-- to filesort. Replace them with composite (subject_col, created_at)
-- indexes that satisfy both predicate and order in a single scan.

DROP INDEX IF EXISTS uq_conversations_issue_agent;
DROP INDEX IF EXISTS uq_conversations_run_agent;
DROP INDEX IF EXISTS idx_conversations_issue_identifier;
DROP INDEX IF EXISTS idx_conversations_run_id;

CREATE INDEX IF NOT EXISTS idx_conversations_issue_identifier_created_at
    ON conversations(issue_identifier, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_run_id_created_at
    ON conversations(run_id, created_at);
