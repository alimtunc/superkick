import type { KnownMemoryRole, MemoryRole } from '@/types'

type LaunchStepLabel = 'Plan' | 'Implement' | 'Review'

const ROLE_STEP: Partial<Record<KnownMemoryRole, LaunchStepLabel>> = {
	plan: 'Plan',
	planner: 'Plan',
	coder: 'Implement',
	implementor: 'Implement',
	implementer: 'Implement',
	review: 'Review',
	reviewer: 'Review'
}

export function memoryRoleStep(role: MemoryRole): LaunchStepLabel | null {
	const key = role.toLowerCase()
	return key in ROLE_STEP ? (ROLE_STEP[key as KnownMemoryRole] ?? null) : null
}
