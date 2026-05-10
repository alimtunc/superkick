import type { LaunchStepKind, LaunchTask, LaunchTaskStatus, LaunchTaskStep } from '@/types'

export interface BlockingContext {
	step: LaunchTaskStep | null
	stepKind: LaunchStepKind | null
	headline: string
	hint: string
}

export const TERMINAL_LAUNCH_TASK_STATUSES = new Set<LaunchTaskStatus>(['completed', 'failed', 'cancelled'])

const STEP_KIND_LABEL: Record<LaunchStepKind, string> = {
	plan: 'Plan',
	implement: 'Implement',
	review: 'Review'
}

const STEP_KIND_HINT: Record<LaunchStepKind, string> = {
	plan: 'Open the run terminal to take over, or retry the planner.',
	implement: 'Open the run terminal to take over, or retry the coder.',
	review: 'Open the run terminal to take over, or retry the reviewer.'
}

const FALLBACK_HEADLINE = 'Launch task waiting on you'
const FALLBACK_HINT = 'Reply in the chat to keep the task moving.'

function pickHeadline(kind: LaunchStepKind | null): string {
	return kind ? `${STEP_KIND_LABEL[kind]} step waiting on you` : FALLBACK_HEADLINE
}

function pickHint(kind: LaunchStepKind | null): string {
	return kind ? STEP_KIND_HINT[kind] : FALLBACK_HINT
}

export function findBlockingContext(task: LaunchTask, steps: LaunchTaskStep[]): BlockingContext | null {
	const stepNeedsHuman = steps.find((s) => s.status === 'needs_human') ?? null
	if (stepNeedsHuman) {
		const kind = stepNeedsHuman.step_kind
		return {
			step: stepNeedsHuman,
			stepKind: kind,
			headline: pickHeadline(kind),
			hint: stepNeedsHuman.summary?.trim() || STEP_KIND_HINT[kind]
		}
	}
	if (task.status === 'needs_human') {
		const current = task.current_step_id
			? (steps.find((s) => s.id === task.current_step_id) ?? null)
			: null
		const kind = current?.step_kind ?? null
		return {
			step: current,
			stepKind: kind,
			headline: pickHeadline(kind),
			hint: task.summary?.trim() || pickHint(kind)
		}
	}
	return null
}
