import type { PillTone } from '@/components/ui/pill'
import type { KnownMemoryRole, MemoryRole } from '@/types'

const ROLE_TONE: Record<KnownMemoryRole, PillTone> = {
	plan: 'info',
	planner: 'info',
	decision: 'accent',
	fact: 'success',
	note: 'neutral',
	warning: 'warn',
	error: 'danger',
	failure: 'danger',
	review: 'accent',
	reviewer: 'accent',
	coder: 'info',
	implementor: 'info',
	implementer: 'info'
}

export function memoryRoleTone(role: MemoryRole): PillTone {
	const key = role.toLowerCase()
	return key in ROLE_TONE ? ROLE_TONE[key as KnownMemoryRole] : 'neutral'
}
