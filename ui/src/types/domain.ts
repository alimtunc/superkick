// ── Run state machine ──────────────────────────────────────────────────

export type RunState =
	| 'queued'
	| 'preparing'
	| 'planning'
	| 'coding'
	| 'running_commands'
	| 'reviewing'
	| 'waiting_human'
	| 'opening_pr'
	| 'completed'
	| 'failed'
	| 'cancelled'

export type StepKey = 'prepare' | 'plan' | 'code' | 'commands' | 'review_swarm' | 'create_pr' | 'await_human'

export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'

// ── Events ─────────────────────────────────────────────────────────────

export type EventKind =
	| 'state_change'
	| 'step_started'
	| 'step_completed'
	| 'step_failed'
	| 'agent_output'
	| 'command_output'
	| 'interrupt_created'
	| 'interrupt_resolved'
	| 'review_completed'
	| 'error'

export type EventLevel = 'debug' | 'info' | 'warn' | 'error'

// ── Core entities ──────────────────────────────────────────────────────

export interface Run {
	id: string
	issue_id: string
	issue_identifier: string
	repo_slug: string
	state: RunState
	trigger_source: string
	current_step_key: StepKey | null
	base_branch: string | null
	worktree_path: string | null
	branch_name: string | null
	started_at: string
	updated_at: string
	finished_at: string | null
	error_message: string | null
}

export interface RunStep {
	id: string
	run_id: string
	step_key: StepKey
	status: StepStatus
	attempt: number
	agent_provider: string | null
	started_at: string | null
	finished_at: string | null
	input_json: string | null
	output_json: string | null
	error_message: string | null
}

export interface RunEvent {
	id: string
	run_id: string
	run_step_id: string | null
	ts: string
	kind: EventKind
	level: EventLevel
	message: string
	payload_json: string | null
}

// ── Interrupts ─────────────────────────────────────────────────────────

export type InterruptStatus = 'pending' | 'resolved' | 'dismissed'

export interface Interrupt {
	id: string
	run_id: string
	run_step_id: string | null
	question: string
	context_json: unknown | null
	status: InterruptStatus
	answer_json: unknown | null
	created_at: string
	resolved_at: string | null
}

export type InterruptAction =
	| { action: 'retry_step' }
	| { action: 'continue_with_note'; note: string }
	| { action: 'abort_run' }

// ── Review ─────────────────────────────────────────────────────────────

export interface ReviewFinding {
	agent_name: string
	session_id: string
	passed: boolean
	exit_code: number | null
}

export interface ReviewSwarmResult {
	findings: ReviewFinding[]
	total_agents: number
	passed_count: number
	failed_count: number
	gate_passed: boolean
}
