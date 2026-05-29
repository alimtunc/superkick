import type {
	ExecActivityKind,
	ExecActivityRow,
	ExecFileChange,
	LaunchStepKind,
	LaunchTaskStep,
	LaunchTaskStepStatus,
	Phase,
	PhaseStatus
} from '@/types'

import { LAUNCH_STEP_KIND_LABEL, LAUNCH_STEP_STATUS_LABEL } from './launchTaskLabels'

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

function phaseMeta(step: LaunchTaskStep | undefined): string | null {
	if (!step) return null
	if (step.status === 'running' || step.status === 'needs_human') {
		return LAUNCH_STEP_STATUS_LABEL[step.status]
	}
	return null
}

export function derivePhases(steps: readonly LaunchTaskStep[]): Phase[] {
	return PHASE_ORDER.map((kind) => {
		const step = steps.find((s) => s.step_kind === kind)
		if (!step) return { kind, status: 'pending', meta: null }
		return { kind, status: STEP_STATUS_TO_PHASE[step.status], meta: phaseMeta(step) }
	})
}

export function pickRepresentativeStep(steps: readonly LaunchTaskStep[]): LaunchTaskStep | null {
	const live = steps.find((s) => s.status === 'running' || s.status === 'needs_human')
	if (live) return live
	const ordered = steps.toSorted((a, b) => a.sequence - b.sequence)
	return ordered.findLast((s) => s.agent_name || s.model) ?? ordered.at(-1) ?? null
}

const ACTIVE_STEP_STATUSES: ReadonlySet<LaunchTaskStepStatus> = new Set(['running', 'needs_human'])

function activityKindFor(step: LaunchTaskStep): ExecActivityKind {
	if (step.status === 'needs_human') return 'ask'
	if (step.status === 'failed' || step.status === 'cancelled') return 'stuck'
	if (step.status === 'completed') return 'done'
	if (step.step_kind === 'plan') return 'plan'
	if (step.step_kind === 'review') return 'test'
	return 'edit'
}

function activityTitleFor(step: LaunchTaskStep): string {
	const summary = step.summary?.trim() || step.structured_result?.summary.trim()
	if (summary) return summary
	return `${LAUNCH_STEP_KIND_LABEL[step.step_kind]} · ${LAUNCH_STEP_STATUS_LABEL[step.status]}`
}

/** Latest-first activity rows derived from real launch-task steps; capped to `limit`. */
export function deriveActivityRows(steps: readonly LaunchTaskStep[], limit = 5): ExecActivityRow[] {
	return steps
		.toSorted((a, b) => b.sequence - a.sequence)
		.filter((step) => step.status !== 'pending')
		.slice(0, limit)
		.map((step) => ({
			id: step.id,
			kind: activityKindFor(step),
			title: activityTitleFor(step),
			meta: LAUNCH_STEP_STATUS_LABEL[step.status],
			active: ACTIVE_STEP_STATUSES.has(step.status)
		}))
}

/** Changed-file rows from structured step results. Counts are unknown today → null (no fabrication). */
export function deriveChangedFiles(steps: readonly LaunchTaskStep[]): ExecFileChange[] {
	const active = new Set(
		steps
			.filter((step) => ACTIVE_STEP_STATUSES.has(step.status))
			.flatMap((step) => step.structured_result?.changed_files ?? [])
	)
	const seen = new Set<string>()
	const files: ExecFileChange[] = []
	for (const step of steps) {
		for (const path of step.structured_result?.changed_files ?? []) {
			if (seen.has(path)) continue
			seen.add(path)
			files.push({ path, adds: null, dels: null, active: active.has(path) })
		}
	}
	return files
}
