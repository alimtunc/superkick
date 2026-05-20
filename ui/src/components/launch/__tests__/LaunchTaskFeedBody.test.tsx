import type { ReactNode } from 'react'

import { LaunchTaskFeedBody } from '@/components/launch/LaunchTaskFeedBody'
import type { LaunchTask, LaunchTaskStep } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function step(overrides: Partial<LaunchTaskStep>): LaunchTaskStep {
	return {
		id: overrides.id ?? 'step-1',
		launch_task_id: 'task-1',
		sequence: overrides.sequence ?? 1,
		step_kind: overrides.step_kind ?? 'plan',
		agent_name: overrides.agent_name ?? 'planner',
		provider: 'claude',
		model: null,
		mode: null,
		status: overrides.status ?? 'completed',
		linked_run_id: null,
		linked_conversation_id: null,
		linked_orchestrator_session_id: null,
		summary: overrides.summary ?? null,
		structured_result: null,
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
		status: overrides.status ?? 'running',
		current_step_id: overrides.current_step_id ?? null,
		summary: null,
		created_at: '2026-05-19T00:00:00Z',
		updated_at: '2026-05-19T00:00:00Z'
	}
}

function wrap(node: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
	})
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

describe('LaunchTaskFeedBody routing', () => {
	it('renders the class-aware failure copy for a step with a classification', () => {
		const steps = [
			step({
				id: 'plan',
				step_kind: 'plan',
				status: 'needs_human',
				summary: 'raw error string that must not leak',
				failure_classification: { kind: 'auth_required', provider: 'claude' }
			})
		]
		const { container } = render(
			wrap(<LaunchTaskFeedBody task={task({ status: 'needs_human' })} steps={steps} />)
		)
		// Headline appears in both the callout and the failure row — assert at least one match.
		expect(screen.getAllByText(/Sign in to Claude required/i).length).toBeGreaterThanOrEqual(1)
		// Raw summary must not leak through anywhere in the feed.
		expect(container.textContent ?? '').not.toMatch(/raw error string/i)
	})

	it('falls back to the legacy evidence row when the step has no classification', () => {
		const steps = [
			step({
				id: 'plan',
				step_kind: 'plan',
				status: 'completed',
				summary: 'plan looks good',
				failure_classification: null
			})
		]
		render(wrap(<LaunchTaskFeedBody task={task()} steps={steps} />))
		expect(screen.getByText(/plan looks good/i)).toBeInTheDocument()
	})

	it('hides Retry when the blocking classification is terminal Failed (cli_missing)', () => {
		const steps = [
			step({
				id: 'plan',
				step_kind: 'plan',
				status: 'needs_human',
				failure_classification: {
					kind: 'cli_missing',
					binary: 'claude',
					install_hint: 'brew install …'
				}
			})
		]
		render(
			wrap(
				<LaunchTaskFeedBody
					task={task({ status: 'needs_human', current_step_id: 'plan' })}
					steps={steps}
				/>
			)
		)
		expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
	})

	it('keeps Retry visible when the blocking classification is needs_human (auth_required)', () => {
		const steps = [
			step({
				id: 'plan',
				step_kind: 'plan',
				status: 'needs_human',
				failure_classification: { kind: 'auth_required', provider: 'codex' }
			})
		]
		render(
			wrap(
				<LaunchTaskFeedBody
					task={task({ status: 'needs_human', current_step_id: 'plan' })}
					steps={steps}
				/>
			)
		)
		expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
	})

	it('renders no callout when no step is blocked and the task is not in needs_human', () => {
		const steps = [step({ status: 'completed' })]
		render(wrap(<LaunchTaskFeedBody task={task({ status: 'running' })} steps={steps} />))
		expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
	})
})
