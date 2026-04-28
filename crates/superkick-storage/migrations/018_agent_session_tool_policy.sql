-- SUP-104: per-session audit of MCP and tool policy.
--
-- mcp_servers_used         JSON array of MCP server names actually wired at
--                          spawn (post-degradation). NULL on legacy rows.
-- tools_allow_snapshot     JSON array snapshot of the role's tool allowlist
--                          at spawn, or NULL when the role declared no
--                          allowlist (i.e. no restriction).
-- tool_approval_required   1 when the role required operator approval per
--                          tool call. Default 0 so legacy rows carry the
--                          historical "no approval required" intent.
-- tool_results_persisted   1 when tool result payloads are stored in the
--                          audit trail. Default 1 — historical behaviour.
ALTER TABLE agent_sessions ADD COLUMN mcp_servers_used TEXT NULL;
ALTER TABLE agent_sessions ADD COLUMN tools_allow_snapshot TEXT NULL;
ALTER TABLE agent_sessions ADD COLUMN tool_approval_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_sessions ADD COLUMN tool_results_persisted INTEGER NOT NULL DEFAULT 1;
