-- Agent Authoring V2: an agent carries its own attached skills, identity badge,
-- and description. Additive nullable columns (skills_json defaults to an empty
-- JSON array) — no CHECK, no FK, no table rebuild, so existing rows keep
-- skills_json = '[]' and NULL avatar/description until edited or re-seeded.
ALTER TABLE agent_definitions ADD COLUMN skills_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE agent_definitions ADD COLUMN avatar_json TEXT;
ALTER TABLE agent_definitions ADD COLUMN description TEXT;
