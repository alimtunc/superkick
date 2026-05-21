import type { LinearStateType, StatusIconKind } from '@/types'
import { statusIconKindFromLinear } from '@/ui/StatusIcon'

const LINEAR_TYPES: ReadonlySet<LinearStateType> = new Set([
	'backlog',
	'unstarted',
	'started',
	'completed',
	'canceled'
])

export function stateTypeToStatusKind(stateType: string): StatusIconKind {
	if (LINEAR_TYPES.has(stateType as LinearStateType)) {
		return statusIconKindFromLinear(stateType as LinearStateType)
	}
	return 'todo'
}
