import type { LaunchTaskStep, LaunchTaskWithSteps, LinkedRunSummary } from '@/types'

export function pickLinkedRunId(steps: readonly LaunchTaskStep[]): string | null {
	return steps.find((s) => s.linked_run_id)?.linked_run_id ?? null
}

export function pickRunForTask(
	task: LaunchTaskWithSteps,
	fallback: LinkedRunSummary | null
): LinkedRunSummary | null {
	const linkedRunId = pickLinkedRunId(task.steps)
	if (!linkedRunId) return fallback
	return fallback && fallback.id === linkedRunId ? fallback : null
}
