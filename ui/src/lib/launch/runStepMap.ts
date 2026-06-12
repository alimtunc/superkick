import type { LaunchStepKind, LaunchTaskStep, RunStep, StepKey } from '@/types'

// Mirrors the runtime's `ensure_run_step` kind→key mapping (the only link
// between a launch step and its shadow run_step).
const STEP_KIND_TO_RUN_STEP_KEY: Record<LaunchStepKind, StepKey> = {
	plan: 'plan',
	implement: 'code',
	review: 'review_swarm'
}

function byStartedAt(a: RunStep, b: RunStep): number {
	return (a.started_at ?? '').localeCompare(b.started_at ?? '')
}

// run_step_id whose events belong to `step`, or `null` (caller falls back to the
// whole run) when the kind→key map is ambiguous or the step has no run_step yet.
export function runStepIdForLaunchStep(
	step: LaunchTaskStep,
	launchSteps: readonly LaunchTaskStep[],
	runSteps: readonly RunStep[]
): string | null {
	const sameKindCount = launchSteps.filter(
		(candidate) => candidate.step_kind === step.step_kind && candidate.enabled !== false
	).length
	if (sameKindCount !== 1) return null

	const key = STEP_KIND_TO_RUN_STEP_KEY[step.step_kind]
	const matches = runSteps.filter((runStep) => runStep.step_key === key).toSorted(byStartedAt)
	const latest = matches[matches.length - 1]
	return latest?.id ?? null
}
