import type { ReactNode } from 'react'

import { TaskCockpitNowPanel } from '@/domains/launch/components/task-cockpit/TaskCockpitNowPanel'
import type { LaunchTask, LaunchTaskStep, LaunchTaskStatus } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) => {
		const { to: _to, params: _params, ...attrs } = rest
		void _to
		void _params
		return (
			<a href="#" {...(attrs as Record<string, string>)}>
				{children}
			</a>
		)
	}
}))

const TASK_ID = '11111111-1111-1111-1111-111111111111'
const ISSUE_ID = 'SUP-178'

function buildTask(overrides: Partial<LaunchTask> = {}): LaunchTask {
	return {
		id: TASK_ID,
		linear_issue_id: ISSUE_ID,
		recipe_kind: 'plan_implement_review',
		status: 'running',
		current_step_id: 'step-1',
		summary: 'Make the task cockpit honest.',
		created_at: '2026-05-25T10:00:00.000Z',
		updated_at: '2026-05-25T10:05:00.000Z',
		...overrides
	}
}

function buildStep(overrides: Partial<LaunchTaskStep> = {}): LaunchTaskStep {
	return {
		id: 'step-1',
		launch_task_id: TASK_ID,
		sequence: 1,
		step_kind: 'implement',
		agent_name: 'codecat',
		provider: 'claude',
		model: null,
		mode: null,
		status: 'running',
		linked_run_id: null,
		linked_conversation_id: null,
		linked_orchestrator_session_id: null,
		summary: 'Coding the change.',
		structured_result: null,
		failure_classification: null,
		auto_resume_count: 0,
		created_at: '2026-05-25T10:00:00.000Z',
		updated_at: '2026-05-25T10:05:00.000Z',
		...overrides
	}
}

function wrap(node: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
	})
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

function renderPanel(
	overrides: {
		status?: LaunchTaskStatus
		isTerminal?: boolean
		linkedRunId?: string | null
		model?: string | null
	} = {}
) {
	const task = buildTask({ status: overrides.status ?? 'running' })
	const steps = [buildStep({ model: overrides.model ?? null })]
	return render(
		wrap(
			<TaskCockpitNowPanel
				task={task}
				steps={steps}
				isTerminal={overrides.isTerminal ?? false}
				linkedRunId={overrides.linkedRunId ?? null}
				worktreePath={null}
				branchName={null}
				pr={null}
			/>
		)
	)
}

describe('TaskCockpitNowPanel', () => {
	it('renders Cancel and no textarea for a running task', () => {
		renderPanel({ status: 'running' })
		expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
		expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
		expect(document.querySelector('textarea')).toBeNull()
	})

	it('renders Open issue link and no composer for a needs_human task', () => {
		renderPanel({ status: 'needs_human' })
		expect(screen.getByRole('link', { name: `Open issue ${ISSUE_ID}` })).toHaveTextContent(/Open issue/)
		expect(document.querySelector('textarea')).toBeNull()
		expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
	})

	it('renders no action row when the task is terminal', () => {
		renderPanel({ status: 'completed', isTerminal: true })
		expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument()
		expect(screen.queryByRole('link', { name: `Open issue ${ISSUE_ID}` })).not.toBeInTheDocument()
		expect(document.querySelector('textarea')).toBeNull()
	})

	it('falls back to "not attached" when the current step has no model', () => {
		renderPanel({ status: 'running', model: null })
		const allMuted = screen.getAllByText('not attached')
		expect(allMuted.length).toBeGreaterThan(0)
		expect(screen.queryByText('default')).not.toBeInTheDocument()
	})
})
