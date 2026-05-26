import type { LaunchStepKind, LaunchTaskStep, LaunchTaskStepStatus, Phase, PhaseStatus } from '@/types'

export const PHASE_ORDER: readonly LaunchStepKind[] = ['plan', 'implement', 'review'] as const

const STEP_STATUS_TO_PHASE: Record<LaunchTaskStepStatus, PhaseStatus> = {
	pending: 'pending',
	running: 'active',
	completed: 'done',
	failed: 'failed',
	needs_human: 'paused',
	skipped: 'done',
	cancelled: 'failed'
}

export function derivePhases(steps: readonly LaunchTaskStep[]): Phase[] {
	return PHASE_ORDER.map((kind) => {
		const step = steps.find((s) => s.step_kind === kind)
		if (!step) return { kind, status: 'pending' }
		return { kind, status: STEP_STATUS_TO_PHASE[step.status] }
	})
}

export function pickRepresentativeStep(steps: readonly LaunchTaskStep[]): LaunchTaskStep | null {
	const live = steps.find((s) => s.status === 'running' || s.status === 'needs_human')
	if (live) return live
	const ordered = steps.toSorted((a, b) => a.sequence - b.sequence)
	return ordered.findLast((s) => s.agent_name || s.model) ?? ordered.at(-1) ?? null
}
