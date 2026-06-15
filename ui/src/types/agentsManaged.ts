// Hand-maintained mirror of `superkick_core::AgentDefinition`
// (`CoreAgentDefinition`), the full editable agent returned by
// `GET /api/agents/{name}` and accepted by POST/PATCH. The thin launcher/roster
// projection lives in `./agents` as `Agent`; this is the cockpit/editor shape.

import type { AgentAvatar, AgentOrigin, AgentProvider, BillingProfile, RunnerMode } from './agents'
import type { ReasoningEffort } from './launch'

export type { AgentAvatar }

export type LinearContextMode = 'none' | 'snapshot' | 'snapshot_plus_mcp'

export type McpMode = 'none' | 'servers'

export interface ResolvedMcpPolicy {
	mode: McpMode
	servers: string[]
}

export interface ResolvedToolPolicy {
	allow: string[] | null
	deny: string[] | null
	require_approval: boolean
	persist_results: boolean
}

// Tagged union mirroring the Rust `AgentBackend` (serde tag = "type").
export type AgentBackend =
	| { type: 'protocol' }
	| { type: 'claude_subagent'; subagent_name: string }
	| { type: 'claude_skill'; skills: string[] }

export interface ManagedAgent {
	name: string
	provider: AgentProvider
	role: string | null
	model: string | null
	system_prompt: string | null
	timeout_secs: number | null
	max_turns: number | null
	origin: AgentOrigin
	linear_context: LinearContextMode
	mcp_policy: ResolvedMcpPolicy
	tool_policy: ResolvedToolPolicy
	backend: AgentBackend | null
	runner_mode: RunnerMode | null
	billing_profile: BillingProfile | null
	default_reasoning: ReasoningEffort
	enabled: boolean
	/** Attached skill ids — materialised at launch when this agent drives a step. */
	skills: string[]
	/** Identity badge (emoji/icon + color); `null` falls back to an initial. */
	avatar: AgentAvatar | null
	/** Operator-facing one-line description. */
	description: string | null
}

export const LINEAR_CONTEXT_OPTIONS: LinearContextMode[] = ['none', 'snapshot', 'snapshot_plus_mcp']

export const LINEAR_CONTEXT_LABEL: Record<LinearContextMode, string> = {
	none: 'None',
	snapshot: 'Snapshot',
	snapshot_plus_mcp: 'Snapshot + MCP'
}
