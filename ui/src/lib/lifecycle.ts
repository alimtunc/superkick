import type { LifecycleBucket, LifecycleIssueInput, RunState } from '@/types'

const ACTIVE_RUN_STATES: ReadonlySet<RunState> = new Set([
	'planning',
	'coding',
	'running_commands',
	'reviewing'
])

const NEEDS_HUMAN_RUN_STATES: ReadonlySet<RunState> = new Set(['waiting_human'])

export function bucketFor(input: LifecycleIssueInput, viewerId: string | null): LifecycleBucket {
	const stateType = input.issue.status.state_type
	if (stateType === 'completed' || stateType === 'canceled') return 'done'

	const run = input.activeRun
	if (run) {
		if (NEEDS_HUMAN_RUN_STATES.has(run.state)) return 'needs'
		if (ACTIVE_RUN_STATES.has(run.state)) return 'active'
	}

	if (stateType === 'started' && viewerId !== null && input.assigneeId === viewerId) {
		return 'launchable'
	}

	return 'open'
}
