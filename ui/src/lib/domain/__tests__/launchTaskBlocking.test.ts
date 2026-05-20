import type { FailureClassification, LaunchTask, LaunchTaskStep } from '@/types'
import { describe, expect, it } from 'vitest'

import { findBlockingContext } from '../launchTaskBlocking'

function step(overrides: Partial<LaunchTaskStep>): LaunchTaskStep {
	return {
		id: overrides.id ?? 'step-1',
		launch_task_id: 'task-1',
		sequence: overrides.sequence ?? 2,
		step_kind: overrides.step_kind ?? 'implement',
		agent_name: overrides.agent_name ?? 'coder-default',
		provider: overrides.provider ?? 'claude',
		model: overrides.model ?? null,
		mode: overrides.mode ?? null,
		status: overrides.status ?? 'needs_human',
		linked_run_id: overrides.linked_run_id ?? null,
		linked_conversation_id: overrides.linked_conversation_id ?? null,
		linked_orchestrator_session_id: overrides.linked_orchestrator_session_id ?? null,
		summary: overrides.summary ?? null,
		structured_result: overrides.structured_result ?? null,
		failure_classification: overrides.failure_classification ?? null,
		created_at: '2026-05-19T00:00:00Z',
		updated_at: '2026-05-19T00:00:00Z'
	}
}

function task(overrides: Partial<LaunchTask> = {}): LaunchTask {
	return {
		id: 'task-1',
		linear_issue_id: 'TEAM-1',
		recipe_kind: 'plan_implement_review',
		status: overrides.status ?? 'needs_human',
		current_step_id: overrides.current_step_id ?? null,
		summary: overrides.summary ?? null,
		created_at: '2026-05-19T00:00:00Z',
		updated_at: '2026-05-19T00:00:00Z'
	}
}

describe('findBlockingContext', () => {
	it('returns null when no step is needs_human and the task is not blocked', () => {
		const t = task({ status: 'running' })
		const s = [step({ status: 'completed' })]
		expect(findBlockingContext(t, s)).toBeNull()
	})

	it('prefers the classification copy over the raw summary for the blocked step', () => {
		const classification: FailureClassification = {
			kind: 'auth_required',
			provider: 'claude'
		}
		const s = [
			step({
				status: 'needs_human',
				summary: 'agent reported authentication required',
				failure_classification: classification
			})
		]
		const ctx = findBlockingContext(task(), s)
		expect(ctx).not.toBeNull()
		expect(ctx?.classification).toEqual(classification)
		expect(ctx?.headline).toContain('Claude')
		// Raw summary must not leak through when a classification is available.
		expect(ctx?.hint).not.toContain('agent reported authentication required')
	})

	it('falls back to the raw step summary for legacy needs_human rows without a classification', () => {
		const s = [
			step({
				status: 'needs_human',
				summary: 'legacy hint without classification'
			})
		]
		const ctx = findBlockingContext(task(), s)
		expect(ctx?.classification).toBeNull()
		expect(ctx?.hint).toBe('legacy hint without classification')
	})

	it('falls back to the kind-specific hint when neither classification nor summary is present', () => {
		const s = [step({ status: 'needs_human', step_kind: 'plan', summary: null })]
		const ctx = findBlockingContext(task(), s)
		expect(ctx?.classification).toBeNull()
		expect(ctx?.hint).toContain('planner')
	})

	it('renders a generic blocked context when the task is needs_human but no step is', () => {
		const t = task({ status: 'needs_human', current_step_id: null })
		const ctx = findBlockingContext(t, [step({ status: 'pending' })])
		expect(ctx?.classification).toBeNull()
		expect(ctx?.headline).toBeTruthy()
	})
})
