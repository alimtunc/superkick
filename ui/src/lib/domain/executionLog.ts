import type {
	ExecActivity,
	LaunchStepKind,
	LaunchTaskStep,
	LaunchTaskStepStatus,
	Phase,
	PhaseStatus
} from '@/types'

import { LAUNCH_STEP_KIND_LABEL } from './launchTaskLabels'

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

const STEP_TO_ROW_KIND: Record<LaunchStepKind, Record<LaunchTaskStepStatus, ExecActivity['kind']>> = {
	plan: {
		pending: 'plan',
		running: 'plan',
		completed: 'plan',
		failed: 'stuck',
		needs_human: 'ask',
		skipped: 'plan',
		cancelled: 'stuck'
	},
	implement: {
		pending: 'edit',
		running: 'edit',
		completed: 'edit',
		failed: 'stuck',
		needs_human: 'ask',
		skipped: 'edit',
		cancelled: 'stuck'
	},
	review: {
		pending: 'test',
		running: 'test',
		completed: 'done',
		failed: 'stuck',
		needs_human: 'ask',
		skipped: 'test',
		cancelled: 'stuck'
	}
}

export function derivePhases(steps: readonly LaunchTaskStep[]): Phase[] {
	return PHASE_ORDER.map((kind) => {
		const step = steps.find((s) => s.step_kind === kind)
		if (!step) return { kind, status: 'pending' }
		return { kind, status: STEP_STATUS_TO_PHASE[step.status] }
	})
}

export function deriveActivity(steps: readonly LaunchTaskStep[]): ExecActivity[] {
	const ordered = steps.toSorted((a, b) => a.sequence - b.sequence)
	return ordered.map((step, index) => ({
		id: step.id,
		kind: STEP_TO_ROW_KIND[step.step_kind][step.status],
		title: step.summary?.trim() || LAUNCH_STEP_KIND_LABEL[step.step_kind],
		meta: step.agent_name || null,
		stepIndex: index
	}))
}
