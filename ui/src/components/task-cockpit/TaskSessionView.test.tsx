import { TaskSessionView } from '@/components/task-cockpit/TaskSessionView'
import type { UseRunSessionReturn } from '@/hooks/useRunSession'
import type { LaunchStepKind, LaunchTask, LaunchTaskStep, Run, RunEvent, RunStep, StepKey } from '@/types'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ useRunSession: vi.fn() }))

vi.mock('@/hooks/useRunSession', () => ({ useRunSession: mocks.useRunSession }))

vi.mock('@/components/run-tabs/RunSessionTabs', () => ({
	RunSessionTabs: ({ events }: { events: RunEvent[] }) => (
		<div data-testid="tabs">{events.length} events</div>
	)
}))

vi.mock('@/components/task-cockpit/StepActionBar', () => ({
	StepActionBar: () => <div data-testid="step-actions" />
}))

const TASK: LaunchTask = {
	id: 'task-1',
	linear_issue_id: 'SUP-1',
	recipe_kind: 'plan_implement_review',
	status: 'running',
	current_step_id: null,
	created_at: '2026-06-01T10:00:00.000Z',
	updated_at: '2026-06-01T10:00:00.000Z'
}

function launchStep(kind: LaunchStepKind, id: string): LaunchTaskStep {
	return {
		id,
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
		updated_at: '2026-06-01T10:00:00.000Z'
	}
}

function runStep(key: StepKey, id: string): RunStep {
	return {
		id,
		run_id: 'run-1',
		step_key: key,
		status: 'succeeded',
		attempt: 1,
		agent_provider: null,
		started_at: '2026-06-01T10:00:00.000Z',
		finished_at: null,
		input_json: null,
		output_json: null,
		error_message: null
	}
}

function event(runStepId: string, id: string): RunEvent {
	return {
		id,
		run_id: 'run-1',
		run_step_id: runStepId,
		seq: 0,
		ts: '2026-06-01T10:00:00.000Z',
		kind: 'agent_protocol',
		level: 'info',
		message: 'protocol',
		payload_json: {}
	}
}

function session(events: RunEvent[], runSteps: RunStep[]): UseRunSessionReturn {
	return {
		loading: false,
		error: null,
		run: { id: 'run-1' } as Run,
		steps: runSteps,
		sessions: [],
		attentionRequests: [],
		pr: null,
		isTerminal: false,
		events,
		refresh: vi.fn()
	} as unknown as UseRunSessionReturn
}

const EVENTS = [
	event('rs-plan', 'e1'),
	event('rs-plan', 'e2'),
	event('rs-code', 'e3'),
	event('rs-code', 'e4'),
	event('rs-code', 'e5')
]
const RUN_STEPS = [runStep('plan', 'rs-plan'), runStep('code', 'rs-code')]

describe('TaskSessionView', () => {
	beforeEach(() => {
		mocks.useRunSession.mockReturnValue(session(EVENTS, RUN_STEPS))
	})

	it('shows the whole run by default and scopes events to the selected step', async () => {
		const steps = [launchStep('plan', 'ls-plan'), launchStep('implement', 'ls-impl')]
		render(<TaskSessionView task={TASK} runId="run-1" steps={steps} />)

		expect(screen.getByTestId('tabs')).toHaveTextContent('5 events')

		await userEvent.click(screen.getByRole('tab', { name: /Implement/ }))
		expect(screen.getByTestId('tabs')).toHaveTextContent('3 events')

		await userEvent.click(screen.getByRole('tab', { name: /Plan/ }))
		expect(screen.getByTestId('tabs')).toHaveTextContent('2 events')
	})

	it('falls back to the whole run when the step→run_step mapping is ambiguous', async () => {
		const steps = [launchStep('implement', 'ls-impl-a'), launchStep('implement', 'ls-impl-b')]
		render(<TaskSessionView task={TASK} runId="run-1" steps={steps} />)

		await userEvent.click(screen.getAllByRole('tab', { name: /Implement/ })[0])
		expect(screen.getByTestId('tabs')).toHaveTextContent('5 events')
	})

	it('defaults the active tab to Activity, not Terminal', () => {
		render(<TaskSessionView task={TASK} runId="run-1" steps={[launchStep('plan', 'ls-plan')]} />)

		expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true')
		expect(screen.getByRole('tab', { name: 'Terminal' })).toHaveAttribute('aria-selected', 'false')
	})
})
