-- Add operator instruction field for launch profiles (SUP-60).
ALTER TABLE runs ADD COLUMN operator_instructions TEXT;
