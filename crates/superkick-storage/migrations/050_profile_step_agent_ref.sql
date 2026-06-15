-- SUP-206: a launch profile step may name an app-managed agent as its primary
-- execution unit. Additive nullable column — no CHECK, no FK (agent names are
-- free-form catalog refs like `launch_task_steps.agent_name`), so no table
-- rebuild is needed and existing skill-first rows keep `agent_ref = NULL`.
ALTER TABLE launch_profile_steps ADD COLUMN agent_ref TEXT;
