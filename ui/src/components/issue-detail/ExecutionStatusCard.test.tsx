import type { ReactNode } from 'react'

import { ExecutionStatusCard } from '@/components/issue-detail/ExecutionStatusCard'
import type {
	IssueDetailResponse,
	LaunchTask,
	LaunchTaskStep,
	LaunchTaskWithSteps,
	LinkedRunSummary
} from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	useIssueLaunchTasks: vi.fn(),
	openDrawer: vi.fn()
}))

vi.mock('@/hooks/useIssueLaunchTasks', () => ({
	useIssueLaunchTasks: mocks.useIssueLaunchTasks
}))

vi.mock('@/stores/runDrawer', () => ({
	useRunDrawerStore: (selector: (state: { openDrawer: typeof mocks.openDrawer }) => unknown) =>
		selector({ openDrawer: mocks.openDrawer })
}))

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) => {
		const { to: _to, params: _params, search: _search, ...attrs } = rest
		void _to
		void _params
		void _search
		return (
			<a href="#" {...(attrs as Record<string, string>)}>
				{children}
			</a>
		)
	}
}))

function buildTask(id: string, overrides: Partial<LaunchTask> = {}): LaunchTask {
	return {
		id,
		linear_issue_id: 'SUP-178',
		recipe_kind: 'plan_implement_review',
		status: 'completed',
		current_step_id: null,
		summary: null,
		created_at: '2026-05-25T10:00:00.000Z',
		updated_at: '2026-05-25T10:05:00.000Z',
		...overrides
	}
}

function buildStep(taskId: string, runId: string | null = null): LaunchTaskStep {
	return {
		id: `step-${taskId}`,
		launch_task_id: taskId,
		sequence: 1,
		step_kind: 'implement',
		agent_name: 'codecat',
		provider: 'claude',
		model: null,
		mode: null,
		status: 'completed',
		linked_run_id: runId,
		linked_conversation_id: null,
		linked_orchestrator_session_id: null,
		summary: null,
		structured_result: null,
		failure_classification: null,
		created_at: '2026-05-25T10:00:00.000Z',
		updated_at: '2026-05-25T10:05:00.000Z'
	}
}

function buildIssue(overrides: Partial<IssueDetailResponse> = {}): IssueDetailResponse {
	return {
		identifier: 'SUP-178',
		linked_runs: [] as LinkedRunSummary[],
		...overrides
	} as IssueDetailResponse
}

function wrap(node: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
	})
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

beforeEach(() => {
	mocks.useIssueLaunchTasks.mockReset()
	mocks.openDrawer.mockReset()
})

describe('ExecutionStatusCard', () => {
	it('renders the empty fallback when no tasks are loaded', () => {
		mocks.useIssueLaunchTasks.mockReturnValue({
			tasks: [],
			activeTask: null,
			tasksWithSteps: [] as LaunchTaskWithSteps[],
			loading: false,
			error: null
		})

		render(wrap(<ExecutionStatusCard issue={buildIssue()} />))
		expect(screen.getByText('No task on this issue.')).toBeInTheDocument()
	})

	it('renders only the latest task when there is exactly one', () => {
		mocks.useIssueLaunchTasks.mockReturnValue({
			tasks: [buildTask('task-1')],
			activeTask: null,
			tasksWithSteps: [
				{ task: buildTask('task-1'), steps: [buildStep('task-1', 'run-1')] }
			] as LaunchTaskWithSteps[],
			loading: false,
			error: null
		})

		render(wrap(<ExecutionStatusCard issue={buildIssue()} />))
		expect(screen.queryByRole('button', { name: /show history/i })).not.toBeInTheDocument()
	})

	it('shows a "Show history (N)" disclosure when more than one task exists', async () => {
		const tasksWithSteps: LaunchTaskWithSteps[] = [
			{ task: buildTask('task-3', { id: 'task-3' }), steps: [buildStep('task-3', 'run-3')] },
			{ task: buildTask('task-2', { id: 'task-2' }), steps: [buildStep('task-2', 'run-2')] },
			{ task: buildTask('task-1', { id: 'task-1' }), steps: [buildStep('task-1', 'run-1')] }
		]
		mocks.useIssueLaunchTasks.mockReturnValue({
			tasks: tasksWithSteps.map((t) => t.task),
			activeTask: null,
			tasksWithSteps,
			loading: false,
			error: null
		})

		const user = userEvent.setup()
		render(wrap(<ExecutionStatusCard issue={buildIssue()} />))

		const disclosure = screen.getByRole('button', { name: /show history \(2\)/i })
		expect(disclosure).toBeInTheDocument()

		await user.click(disclosure)
		expect(screen.getByRole('button', { name: /open run drawer for task task-2/i })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: /open run drawer for task task-1/i })).toBeInTheDocument()

		await user.click(screen.getByRole('button', { name: /open run drawer for task task-2/i }))
		expect(mocks.openDrawer).toHaveBeenCalledWith('run-2', 'activity')
	})
})
