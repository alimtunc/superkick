-- SUP-81: persist Linear "blocks" relations so the launch-queue classifier
-- can gate downstream issues without round-tripping to Linear per pulse, and
-- so the poll-diff emitter can detect blocker-terminal transitions.
--
-- One row per (downstream, blocker). The blocker's identifier / title /
-- state_type are denormalised: the downstream card renders "Blocked by
-- SUP-77 (In Progress)" without hydrating the blocker issue.
--
-- The table is a *snapshot*, not an event log — re-polling replaces the rows
-- for each downstream wholesale. Transitions are detected by comparing the
-- snapshot before replacement to the freshly fetched relations.

CREATE TABLE IF NOT EXISTS issue_blockers (
    downstream_issue_id  TEXT NOT NULL,
    blocker_issue_id     TEXT NOT NULL,
    blocker_identifier   TEXT NOT NULL,
    blocker_title        TEXT NOT NULL,
    blocker_state_type   TEXT NOT NULL,
    recorded_at          TEXT NOT NULL,
    PRIMARY KEY (downstream_issue_id, blocker_issue_id)
);

CREATE INDEX IF NOT EXISTS idx_issue_blockers_downstream
    ON issue_blockers(downstream_issue_id);

CREATE INDEX IF NOT EXISTS idx_issue_blockers_blocker
    ON issue_blockers(blocker_issue_id);
