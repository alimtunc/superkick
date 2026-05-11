import type { LaunchStepKind } from '@/types'

export interface LaunchStepDescriptor {
	kind: LaunchStepKind
	label: string
	helper: string
}

/**
 * Ordered launcher recipe (SUP-117). Drives the per-step `AgentPicker` rows on
 * Issue Detail. Lives here so the component file stays focused on rendering.
 */
export const LAUNCH_STEPS: readonly LaunchStepDescriptor[] = [
	{ kind: 'plan', label: 'Plan', helper: 'Reads the issue and writes a plan.' },
	{ kind: 'implement', label: 'Implement', helper: 'Executes the plan in a worktree.' },
	{ kind: 'review', label: 'Review', helper: 'Reviews the diff before ship.' }
]
