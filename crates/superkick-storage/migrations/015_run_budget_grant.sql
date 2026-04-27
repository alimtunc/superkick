-- SUP-72 follow-up: persist the cumulative override grant separately so the
-- supervisor doesn't re-trip the same budget dimension after an operator
-- override. Defaults to '{}' (deserializes to all-zero `RunBudgetGrant` —
-- no offsets) so pre-existing runs remain valid.

ALTER TABLE runs ADD COLUMN budget_grant_json TEXT NOT NULL DEFAULT '{}';
