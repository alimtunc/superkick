import type { SKTone } from './icons'

export type AgentProvider = 'claude' | 'codex'

export type AgentStatus = 'starting' | 'running' | 'completed' | 'failed' | 'cancelled'

export type LaunchReason = 'initial_step' | 'handoff' | 'review_fanout' | 'operator_escalation'

export type RunnerMode = 'interactive_pty' | 'print_stream_json' | 'exec_json'

export type BillingProfile = 'subscription' | 'agent_sdk_credits' | 'api_credits' | 'unknown'

export interface AgentSession {
	id: string
	run_id: string
	run_step_id: string
	provider: AgentProvider
	command: string
	pid: number | null
	status: AgentStatus
	started_at: string
	finished_at: string | null
	exit_code: number | null
	linear_context_mode: string | null
	role: string | null
	purpose: string | null
	parent_session_id: string | null
	launch_reason: LaunchReason | null
	handoff_id: string | null
}

/**
 * SUP-117 — projection of `superkick_core::AgentDefinition` returned by
 * `GET /api/agents`. Hand-maintained mirror; the launcher UI uses it to
 * populate per-step pickers without leaking internal fields like prompts or
 * MCP policy.
 */
export interface Agent {
	name: string
	provider: AgentProvider
	role: string | null
	model: string | null
	runner_mode: RunnerMode
	billing_profile: BillingProfile
}

export interface AgentSummary {
	id: string
	name: string
	role: string
	model: string
	runs: number
	success: number
	sparkline: number[]
	tags: string[]
	tone: SKTone
	status: 'active' | 'paused'
	runner_mode: RunnerMode
	billing_profile: BillingProfile
}

export interface AttachPayload {
	attach_kind: 'recovery_shell' | 'workspace_attach'
	title: string
	summary: string
	command: string
	worktree_path: string
	limitations: string[]
}
