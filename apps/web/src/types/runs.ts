import type { AgentSession } from './agents'
import type { AttentionRequest } from './attention'
import type { SessionOwnershipSnapshot } from './dashboard'
import type { Interrupt } from './interrupts'
import type { LinkedPrSummary, PullRequest } from './pr'

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

export type ExecutionMode = 'full_auto' | 'semi_auto'

export type PauseKind = 'none' | 'budget' | 'approval'

export interface RunBudget {
	duration_secs: number | null
	retries_max: number | null
	token_ceiling: number | null
}

export interface Run {
	id: string
	issue_id: string
	issue_identifier: string
	repo_slug: string
	state: RunState
	trigger_source: string
	execution_mode?: ExecutionMode
	current_step_key: StepKey | null
	base_branch: string | null
	worktree_path: string | null
	branch_name: string | null
	operator_instructions: string | null
	started_at: string
	updated_at: string
	finished_at: string | null
	error_message: string | null
	budget: RunBudget
	pause_kind: PauseKind
	pause_reason: string | null
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

export interface LinkedRunSummary {
	id: string
	state: RunState
	started_at: string
	finished_at: string | null
	pr?: LinkedPrSummary
}

// Mirrors `superkick_core::run_diff::FileDiffStatus` (snake_case serde).
export type FileDiffStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'type_change' | 'untracked'

// UI-only: how the diff viewer lays out hunks. `split` falls back to `unified`
// per-file when there are no deletions (a side-by-side view adds nothing).
export type DiffViewMode = 'unified' | 'split'

// Mirrors `superkick_core::run_diff::FileDiff` (camelCase serde).
export interface FileDiff {
	path: string
	status: FileDiffStatus
	oldPath?: string | null
	additions: number
	deletions: number
	binary: boolean
	truncated: boolean
	patch?: string | null
}

// Mirrors `superkick_core::run_diff::RunDiff`; `overflow` = file list capped.
export interface RunDiff {
	baseRef: string
	headRef: string
	files: FileDiff[]
	fileCount: number
	overflow: boolean
}

export interface RunDiffResponse {
	run: {
		id: string
		useWorktree: boolean
		worktreePath: string | null
		branchName: string | null
	}
	diff: RunDiff
}

export interface ClassifiedRuns {
	active: Run[]
	completed: Run[]
	failed: Run[]
	cancelled: Run[]
	terminal: Run[]
	waitingHuman: Run[]
	needsAttention: Run[]
	reviewing: Run[]
	openingPr: Run[]
	inProgress: Run[]
	queued: Run[]
}

export type RunDiffUnavailableReason = 'no_worktree' | 'not_worktree_backed'

export interface RunDiffUnavailable {
	kind: 'unavailable'
	reason: RunDiffUnavailableReason
}

export type RunDiffResult = { kind: 'ok'; value: RunDiffResponse } | RunDiffUnavailable

export interface RunDetailResponse {
	run: Run
	steps: RunStep[]
	sessions: AgentSession[]
	interrupts: Interrupt[]
	attention_requests: AttentionRequest[]
	ownership: SessionOwnershipSnapshot[]
	pr: PullRequest | null
}
