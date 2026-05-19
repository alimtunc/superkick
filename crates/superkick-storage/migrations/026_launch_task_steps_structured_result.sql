-- Per-step structured completion payload, nullable so legacy rows keep loading.

ALTER TABLE launch_task_steps ADD COLUMN structured_result TEXT;
