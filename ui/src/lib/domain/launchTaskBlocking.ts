import type {
	BlockingContext,
	FailureClassification,
	LaunchStepKind,
	LaunchTask,
	LaunchTaskStatus,
	LaunchTaskStep,
	TerminalKind
} from '@/types'

import { getDisposition, getFailureCopy } from './failureClassification'
import { LAUNCH_STEP_KIND_LABEL } from './launchTaskLabels'

export const TERMINAL_LAUNCH_TASK_STATUSES = new Set<LaunchTaskStatus>(['completed', 'failed', 'cancelled'])

const STEP_KIND_HINT: Record<LaunchStepKind, string> = {
	plan: 'Open the run terminal to take over, or retry the planner.',
	implement: 'Open the run terminal to take over, or retry the coder.',
	review: 'Open the run terminal to take over, or retry the reviewer.'
}

const FALLBACK_HEADLINE = 'Launch task waiting on you'
const FALLBACK_HINT = 'Reply in the chat to keep the task moving.'

function pickHeadline(kind: LaunchStepKind | null): string {
	return kind ? `${LAUNCH_STEP_KIND_LABEL[kind]} step waiting on you` : FALLBACK_HEADLINE
}

function pickHint(kind: LaunchStepKind | null): string {
	return kind ? STEP_KIND_HINT[kind] : FALLBACK_HINT
}

export function findBlockingContext(task: LaunchTask, steps: LaunchTaskStep[]): BlockingContext | null {
	const stepNeedsHuman = steps.find((s) => s.status === 'needs_human') ?? null
	if (stepNeedsHuman) {
		const kind = stepNeedsHuman.step_kind
		const classification = stepNeedsHuman.failure_classification ?? null
		if (classification) {
			const copy = getFailureCopy(classification)
			return {
				step: stepNeedsHuman,
				stepKind: kind,
				headline: copy.headline,
				hint: copy.hint,
				classification
			}
		}
		return {
			step: stepNeedsHuman,
			stepKind: kind,
			headline: pickHeadline(kind),
			hint: stepNeedsHuman.summary?.trim() || STEP_KIND_HINT[kind],
			classification: null
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
			hint: task.summary?.trim() || pickHint(kind),
			classification: null
		}
	}
	return null
}

export function pickFinalStep(steps: readonly LaunchTaskStep[]): LaunchTaskStep | null {
	for (let index = steps.length - 1; index >= 0; index -= 1) {
		const step = steps[index]
		if (step.status !== 'pending' && step.status !== 'skipped') {
			return step
		}
	}
	return null
}

// `needs_human` only counts as terminal when the classification has a `failed` disposition (retry impossible).
export function pickTerminalKind(
	task: LaunchTask,
	finalStepClassification: FailureClassification | null
): TerminalKind | null {
	switch (task.status) {
		case 'completed':
			return 'success'
		case 'failed':
		case 'cancelled':
			return 'failure'
		case 'needs_human':
			if (finalStepClassification && getDisposition(finalStepClassification) === 'failed') {
				return 'failure'
			}
			return null
		default:
			return null
	}
}
