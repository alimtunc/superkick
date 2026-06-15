-- Agent Authoring V2: freeze the per-step agent (its primary execution unit)
-- onto the launch task step, mirroring `launch_profile_steps.agent_ref` (050).
-- Additive nullable column — no CHECK, no FK (agent names are free-form catalog
-- refs like `launch_task_steps.agent_name`); existing skill-first rows keep
-- agent_ref = NULL and resolve exactly as before.
ALTER TABLE launch_task_steps ADD COLUMN agent_ref TEXT;
