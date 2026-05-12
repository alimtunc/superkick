import type { LaunchStepKind, LaunchTaskStatus, LaunchTaskStepStatus } from '@/types'
import type { SKTone } from '@/types/icons'

export const LAUNCH_STEP_KIND_LABEL: Record<LaunchStepKind, string> = {
	plan: 'Plan',
	implement: 'Implement',
	review: 'Review'
}

export const LAUNCH_TASK_STATUS_LABEL: Record<LaunchTaskStatus, string> = {
	pending: 'pending',
	running: 'running',
	needs_human: 'needs you',
	completed: 'completed',
	failed: 'failed',
	cancelled: 'cancelled'
}

export const LAUNCH_TASK_STATUS_TONE: Record<LaunchTaskStatus, SKTone> = {
	pending: 'neutral',
	running: 'info',
	needs_human: 'warn',
	completed: 'success',
	failed: 'danger',
	cancelled: 'neutral'
}

export const LAUNCH_STEP_STATUS_LABEL: Record<LaunchTaskStepStatus, string> = {
	pending: 'pending',
	running: 'running',
	completed: 'done',
	failed: 'failed',
	needs_human: 'needs you',
	skipped: 'skipped',
	cancelled: 'cancelled'
}

export const LAUNCH_STEP_STATUS_TONE: Record<LaunchTaskStepStatus, SKTone> = {
	pending: 'neutral',
	running: 'info',
	completed: 'success',
	failed: 'danger',
	needs_human: 'warn',
	skipped: 'neutral',
	cancelled: 'neutral'
}

export const LAUNCH_STEP_MUTED_STATUSES: ReadonlySet<LaunchTaskStepStatus> = new Set([
	'pending',
	'skipped',
	'cancelled'
])
