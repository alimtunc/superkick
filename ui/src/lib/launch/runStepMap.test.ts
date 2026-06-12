import type { LaunchStepKind, LaunchTaskStep, RunStep, StepKey } from '@/types'
import { describe, expect, it } from 'vitest'

import { runStepIdForLaunchStep } from './runStepMap'

function launchStep(kind: LaunchStepKind, overrides: Partial<LaunchTaskStep> = {}): LaunchTaskStep {
	return {
		id: `ls-${kind}`,
		launch_task_id: 'task-1',
		sequence: 1,
		step_kind: kind,
		agent_name: 'claude',
		provider: null,
		model: null,
		mode: null,
		status: 'completed',
		auto_resume_count: 0,
		created_at: '2026-06-01T10:00:00.000Z',
		updated_at: '2026-06-01T10:00:00.000Z',
		...overrides
	}
}

function runStep(key: StepKey, overrides: Partial<RunStep> = {}): RunStep {
	return {
		id: `rs-${key}`,
		run_id: 'run-1',
		step_key: key,
		status: 'succeeded',
		attempt: 1,
		agent_provider: null,
		started_at: '2026-06-01T10:00:00.000Z',
		finished_at: null,
		input_json: null,
		output_json: null,
		error_message: null,
		...overrides
	}
}

describe('runStepIdForLaunchStep', () => {
	const plan = launchStep('plan')
	const implement = launchStep('implement')
	const review = launchStep('review')
	const launchSteps = [plan, implement, review]

	it('maps each kind of a standard recipe to its matching run_step', () => {
		const runSteps = [runStep('plan'), runStep('code'), runStep('review_swarm')]

		expect(runStepIdForLaunchStep(plan, launchSteps, runSteps)).toBe('rs-plan')
		expect(runStepIdForLaunchStep(implement, launchSteps, runSteps)).toBe('rs-code')
		expect(runStepIdForLaunchStep(review, launchSteps, runSteps)).toBe('rs-review_swarm')
	})

	it('resolves a retried step to the latest attempt by started_at', () => {
		const runSteps = [
			runStep('code', { id: 'rs-code-1', attempt: 1, started_at: '2026-06-01T10:00:00.000Z' }),
			runStep('code', { id: 'rs-code-2', attempt: 2, started_at: '2026-06-01T10:05:00.000Z' })
		]

		expect(runStepIdForLaunchStep(implement, launchSteps, runSteps)).toBe('rs-code-2')
	})

	it('degrades to null when multiple enabled steps share a kind (dynamic recipe)', () => {
		const dyn = [
			launchStep('implement', { id: 'ls-impl-a' }),
			launchStep('implement', { id: 'ls-impl-b' })
		]
		const runSteps = [runStep('code')]

		expect(runStepIdForLaunchStep(dyn[0], dyn, runSteps)).toBeNull()
	})

	it('ignores a disabled same-kind sibling when counting ambiguity', () => {
		const enabled = launchStep('implement', { id: 'ls-impl-on' })
		const skipped = launchStep('implement', { id: 'ls-impl-off', enabled: false })
		const runSteps = [runStep('code')]

		expect(runStepIdForLaunchStep(enabled, [enabled, skipped], runSteps)).toBe('rs-code')
	})

	it('returns null when the step has no run_step yet', () => {
		const runSteps = [runStep('plan')]

		expect(runStepIdForLaunchStep(review, launchSteps, runSteps)).toBeNull()
	})
})
