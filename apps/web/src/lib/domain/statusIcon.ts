import type { LinearStateType, StatusIconKind } from '@/types'

const LINEAR_STATE_TO_KIND: Record<LinearStateType, StatusIconKind> = {
	backlog: 'backlog',
	unstarted: 'todo',
	started: 'progress',
	completed: 'done',
	canceled: 'cancelled'
}

export function statusIconKindFromLinear(stateType: LinearStateType): StatusIconKind {
	return LINEAR_STATE_TO_KIND[stateType]
}

// Linear collapses In Progress + In Review into state_type='started'; only the name disambiguates review.
export function statusIconKindFor(status: { state_type: LinearStateType; name: string }): StatusIconKind {
	const name = status.name.toLowerCase()
	if (status.state_type === 'started' && name.includes('review')) return 'review'
	return LINEAR_STATE_TO_KIND[status.state_type]
}
