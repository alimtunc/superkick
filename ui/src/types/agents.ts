export type AgentProvider = 'claude' | 'codex'

export type AgentStatus = 'starting' | 'running' | 'completed' | 'failed' | 'cancelled'

export type LaunchReason = 'initial_step' | 'handoff' | 'review_fanout' | 'operator_escalation'

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

export interface AttachPayload {
	attach_kind: 'recovery_shell' | 'workspace_attach'
	title: string
	summary: string
	command: string
	worktree_path: string
	limitations: string[]
}
