import type { LaunchStepKind, LaunchTaskWithSteps } from './launch'
import type { LinkedPrSummary } from './pr'
import type { LinkedRunSummary, Run } from './runs'

export type PhaseStatus = 'pending' | 'active' | 'done' | 'failed' | 'paused'

export interface Phase {
	kind: LaunchStepKind
	status: PhaseStatus
}

export type ExecRowKind = 'plan' | 'edit' | 'test' | 'ask' | 'stuck' | 'done'

export interface ExecActivity {
	id: string
	kind: ExecRowKind
	title: string
	meta: string | null
	stepIndex: number
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
	activity: ExecActivity[]
	past: LaunchTaskWithSteps[]
}

interface ExecutionLogDoneState {
	kind: 'done'
	task: LaunchTaskWithSteps
	run: LinkedRunSummary | null
	runDetail: Run | null
	phases: Phase[]
	activity: ExecActivity[]
	past: LaunchTaskWithSteps[]
	worktree: WorktreeFacts | null
}

export type ExecutionLogState = ExecutionLogIdleState | ExecutionLogActiveState | ExecutionLogDoneState
