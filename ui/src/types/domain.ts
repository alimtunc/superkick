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

// ── Linear issues (list contract) ─────────────────────────────────────

export interface IssueStatus {
	name: string
	color: string
}

export interface IssuePriority {
	value: number
	label: string
}

export interface IssueLabel {
	name: string
	color: string
}

export interface IssueAssignee {
	name: string
	avatar_url: string | null
}

export interface LinearIssueListItem {
	id: string
	identifier: string
	title: string
	status: IssueStatus
	priority: IssuePriority
	labels: IssueLabel[]
	assignee: IssueAssignee | null
	url: string
	created_at: string
	updated_at: string
}

export interface IssueListResponse {
	issues: LinearIssueListItem[]
	total_count: number
}

// ── Linear issues (detail contract — SUP-16) ─────────────────────────
//
// Compatibility:
// - SUP-17 (Start action): uses `id` + `identifier` from this shape.
// - SUP-19 (run history linkage): `linked_runs` populated server-side.
// - SUP-21 (review context): `comments` carries latest review context.

export interface IssueProject {
	name: string
}

export interface IssueCycle {
	name: string | null
	number: number
}

export interface IssueComment {
	id: string
	body: string
	author: IssueAssignee | null
	created_at: string
	updated_at: string
}

export interface LinkedRunSummary {
	id: string
	state: RunState
	started_at: string
	finished_at: string | null
}

export interface IssueDetailResponse {
	// Required: identity & status
	id: string
	identifier: string
	title: string
	status: IssueStatus
	priority: IssuePriority
	url: string
	created_at: string
	updated_at: string

	// Required: detail-specific
	/** Markdown body. Empty string when no description. */
	description: string

	// Optional: metadata for launch decision
	labels: IssueLabel[]
	assignee: IssueAssignee | null
	project: IssueProject | null
	cycle: IssueCycle | null
	estimate: number | null
	due_date: string | null

	// Optional: review-relevant context (SUP-21 ready)
	comments: IssueComment[]

	// Optional: linked run state (SUP-19 ready)
	linked_runs: LinkedRunSummary[]
}

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
