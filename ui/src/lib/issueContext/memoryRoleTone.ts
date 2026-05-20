import type { PillTone } from '@/components/ui/pill'
import type { KnownMemoryRole, MemoryRole } from '@/types'

const ROLE_TONE: Record<KnownMemoryRole, PillTone> = {
	plan: 'info',
	planner: 'info',
	decision: 'accent',
	fact: 'mineral',
	note: 'neutral',
	warning: 'warn',
	error: 'danger',
	failure: 'danger',
	review: 'violet',
	reviewer: 'violet',
	coder: 'cyan',
	implementor: 'cyan',
	implementer: 'cyan'
}

export function memoryRoleTone(role: MemoryRole): PillTone {
	const key = role.toLowerCase()
	return key in ROLE_TONE ? ROLE_TONE[key as KnownMemoryRole] : 'neutral'
}
