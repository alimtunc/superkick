-- Add execution_mode column to runs table.
-- Defaults to 'full_auto' for backward compatibility with existing runs.
ALTER TABLE runs ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'full_auto';
