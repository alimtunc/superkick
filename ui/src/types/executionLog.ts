import type { LaunchStepKind, LaunchTaskWithSteps } from './launch'
import type { LinkedPrSummary } from './pr'
import type { LinkedRunSummary, Run } from './runs'

export type PhaseStatus = 'pending' | 'active' | 'done' | 'failed' | 'paused'

export interface Phase {
	kind: LaunchStepKind
	status: PhaseStatus
	meta: string | null
}

export type ExecActivityKind =
	| 'plan'
	| 'search'
	| 'tool'
	| 'edit'
	| 'test'
	| 'pr'
	| 'ask'
	| 'stuck'
	| 'note'
	| 'done'

export interface ExecActivityRow {
	id: string
	kind: ExecActivityKind
	title: string
	meta: string | null
	active: boolean
}

export interface ExecFileChange {
	path: string
	adds: number | null
	dels: number | null
	active: boolean
}

export interface WorktreeFacts {
	branch: string | null
	worktreePath: string | null
	pr: LinkedPrSummary | null
}

interface ExecutionLogIdleState {
	kind: 'idle'
}

interface ExecutionLogActiveState {
	kind: 'running' | 'needs'
	task: LaunchTaskWithSteps
	run: LinkedRunSummary | null
	phases: Phase[]
	past: LaunchTaskWithSteps[]
}

interface ExecutionLogDoneState {
	kind: 'done'
	task: LaunchTaskWithSteps
	run: LinkedRunSummary | null
	runDetail: Run | null
	phases: Phase[]
	past: LaunchTaskWithSteps[]
	worktree: WorktreeFacts | null
}

export type ExecutionLogState = ExecutionLogIdleState | ExecutionLogActiveState | ExecutionLogDoneState
