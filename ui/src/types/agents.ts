import type { ReasoningEffort, StepExecutor } from './launch'

export type AgentProvider = 'claude' | 'codex'

export type AgentStatus = 'starting' | 'running' | 'completed' | 'failed' | 'cancelled'

export type LaunchReason = 'initial_step' | 'handoff' | 'review_fanout' | 'operator_escalation'

export type RunnerMode = 'interactive_pty' | 'print_stream_json' | 'exec_json' | 'background_session'

export type BillingProfile = 'subscription' | 'agent_sdk_credits' | 'api_credits' | 'unknown'

export type AgentOrigin = 'builtin' | 'custom'

/** Agent identity badge: an emoji or SK icon name + accent color (hex). */
export interface AgentAvatar {
	icon: string
	color: string
}

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
	/** Product-label derivation of `runner_mode`. */
	executor: StepExecutor
	default_reasoning: ReasoningEffort
	billing_profile: BillingProfile
	origin: AgentOrigin
	enabled: boolean
	/** Identity badge for the roster; `null` falls back to an initial. */
	avatar: AgentAvatar | null
	/** One-line description shown as the roster hint. */
	description: string | null
}

export interface AttachPayload {
	attach_kind: 'recovery_shell' | 'workspace_attach'
	title: string
	summary: string
	command: string
	worktree_path: string
	limitations: string[]
}
