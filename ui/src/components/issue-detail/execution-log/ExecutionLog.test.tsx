import type { ReactNode } from 'react'

import { fetchRun } from '@/api'
import { ExecutionLog } from '@/components/issue-detail/execution-log/ExecutionLog'
import { queryKeys } from '@/lib/queryKeys'
import type {
	IssueDetailResponse,
	LaunchTask,
	LaunchTaskStatus,
	LaunchTaskStep,
	LaunchTaskStepStatus,
	LaunchTaskWithSteps,
	LinkedRunSummary
} from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type RunDetailResponse = Awaited<ReturnType<typeof fetchRun>>

const mocks = vi.hoisted(() => ({
	useIssueLaunchTasks: vi.fn(),
	openDrawer: vi.fn(),
	retryMutate: vi.fn(),
	cancelMutate: vi.fn()
}))

vi.mock('@/hooks/useIssueLaunchTasks', () => ({
	useIssueLaunchTasks: mocks.useIssueLaunchTasks
}))

vi.mock('@/stores/runDrawer', () => ({
	useRunDrawerStore: (selector: (state: { openDrawer: typeof mocks.openDrawer }) => unknown) =>
		selector({ openDrawer: mocks.openDrawer })
}))

vi.mock('@/hooks/useLaunchTaskActions', () => ({
	useRetryLaunchTask: () => ({ mutate: mocks.retryMutate, isPending: false }),
	useCancelLaunchTask: () => ({ mutate: mocks.cancelMutate, isPending: false })
}))

vi.mock('@/hooks/useNow', () => ({
	useNow: () => new Date('2026-05-26T10:05:00.000Z').getTime()
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

function buildIssue(overrides: Partial<IssueDetailResponse> = {}): IssueDetailResponse {
	return {
		identifier: 'SUP-181',
		linked_runs: [] as LinkedRunSummary[],
		...overrides
	} as IssueDetailResponse
}

function buildTask(overrides: Partial<LaunchTask> = {}): LaunchTask {
	return {
		id: 'task-1',
		linear_issue_id: 'SUP-181',
		recipe_kind: 'plan_implement_review',
		status: 'running',
		current_step_id: 'step-implement',
		summary: 'Inline ExecutionLog parity',
		created_at: '2026-05-26T09:00:00.000Z',
		updated_at: '2026-05-26T10:00:00.000Z',
		...overrides
	}
}

function buildStep(overrides: Partial<LaunchTaskStep>): LaunchTaskStep {
	return {
		id: overrides.id ?? 'step',
		launch_task_id: 'task-1',
		sequence: overrides.sequence ?? 1,
		step_kind: overrides.step_kind ?? 'implement',
		agent_name: 'codecat',
		provider: 'claude',
		model: 'sonnet-4.6',
		mode: 'semi_auto',
		status: (overrides.status ?? 'running') as LaunchTaskStepStatus,
		linked_run_id: overrides.linked_run_id ?? null,
		linked_conversation_id: null,
		linked_orchestrator_session_id: null,
		summary: overrides.summary ?? null,
		structured_result: overrides.structured_result ?? null,
		failure_classification: overrides.failure_classification ?? null,
		created_at: '2026-05-26T09:00:00.000Z',
		updated_at: '2026-05-26T10:00:00.000Z'
	}
}

function wrap(node: ReactNode, runDetail?: RunDetailResponse) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
	})
	if (runDetail) {
		client.setQueryData(queryKeys.runs.detail(runDetail.run.id), runDetail)
	}
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

function setTasks(
	taskWithSteps: LaunchTaskWithSteps | null,
	past: LaunchTaskWithSteps[] = [],
	{ loading = false }: { loading?: boolean } = {}
) {
	const tasksWithSteps = taskWithSteps ? [taskWithSteps, ...past] : []
	mocks.useIssueLaunchTasks.mockReturnValue({
		tasks: tasksWithSteps.map((t) => t.task),
		activeTask: taskWithSteps ? taskWithSteps.task : null,
		tasksWithSteps,
		loading,
		error: null
	})
}

beforeEach(() => {
	mocks.useIssueLaunchTasks.mockReset()
	mocks.openDrawer.mockReset()
	mocks.retryMutate.mockReset()
	mocks.cancelMutate.mockReset()
})

describe('ExecutionLog — state branches', () => {
	it('idle: renders the compact "No execution yet" affordance with a Launch task CTA', () => {
		setTasks(null)
		render(wrap(<ExecutionLog issue={buildIssue()} />))

		expect(screen.getByText('No execution yet on this issue.')).toBeInTheDocument()
		expect(screen.getByText('Launch task')).toBeInTheDocument()
		expect(screen.queryByRole('list', { name: /execution phases/i })).toBeNull()
	})

	it('loading: renders a skeleton instead of the idle CTA while tasks first-fetch', () => {
		setTasks(null, [], { loading: true })
		render(wrap(<ExecutionLog issue={buildIssue()} />))

		expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
		expect(screen.queryByText('No execution yet on this issue.')).toBeNull()
		expect(screen.queryByText('Launch task')).toBeNull()
	})

	it('running: shows a "running" state chip, derives phases, and opens the drawer via "Open run"', async () => {
		const taskWithSteps: LaunchTaskWithSteps = {
			task: buildTask({ status: 'running' satisfies LaunchTaskStatus }),
			steps: [
				buildStep({ id: 'step-plan', sequence: 1, step_kind: 'plan', status: 'completed' }),
				buildStep({
					id: 'step-implement',
					sequence: 2,
					step_kind: 'implement',
					status: 'running',
					linked_run_id: 'run-running'
				}),
				buildStep({ id: 'step-review', sequence: 3, step_kind: 'review', status: 'pending' })
			]
		}
		setTasks(taskWithSteps)
		const linkedRun: LinkedRunSummary = {
			id: 'run-running',
			state: 'coding',
			started_at: '2026-05-26T09:30:00.000Z',
			finished_at: null
		}
		render(wrap(<ExecutionLog issue={buildIssue({ linked_runs: [linkedRun] })} />))

		const header = screen.getByText('Coding').closest('header')
		expect(header).not.toBeNull()
		expect(within(header as HTMLElement).getByText('Coding')).toBeInTheDocument()
		const phases = screen.getByRole('list', { name: /execution phases/i })
		expect(within(phases).getByRole('group', { name: /plan done/i })).toBeInTheDocument()
		expect(within(phases).getByRole('group', { name: /implement in progress/i })).toBeInTheDocument()
		expect(within(phases).getByRole('group', { name: /review pending/i })).toBeInTheDocument()

		const user = userEvent.setup()
		await user.click(screen.getByRole('button', { name: /open run/i }))
		expect(mocks.openDrawer).toHaveBeenCalledWith('run-running', 'activity')
	})

	it('needs: surfaces NeedsBanner when the linked run is in waiting_human even with no step in needs_human', () => {
		const taskWithSteps: LaunchTaskWithSteps = {
			task: buildTask({ status: 'running' satisfies LaunchTaskStatus }),
			steps: [
				buildStep({ id: 'step-plan', sequence: 1, step_kind: 'plan', status: 'completed' }),
				buildStep({
					id: 'step-implement',
					sequence: 2,
					step_kind: 'implement',
					status: 'running',
					linked_run_id: 'run-interrupted'
				}),
				buildStep({ id: 'step-review', sequence: 3, step_kind: 'review', status: 'pending' })
			]
		}
		setTasks(taskWithSteps)
		const interruptedRun: LinkedRunSummary = {
			id: 'run-interrupted',
			state: 'waiting_human',
			started_at: '2026-05-26T09:30:00.000Z',
			finished_at: null
		}
		render(wrap(<ExecutionLog issue={buildIssue({ linked_runs: [interruptedRun] })} />))

		const banner = screen.getByRole('region', { name: /needs your decision/i })
		expect(banner).toBeInTheDocument()
		expect(within(banner).getByText(/run paused/i)).toBeInTheDocument()
	})

	it('needs: renders NeedsBanner with Approve / Reject / Comment, and Approve triggers retry', async () => {
		const taskWithSteps: LaunchTaskWithSteps = {
			task: buildTask({
				status: 'needs_human' satisfies LaunchTaskStatus,
				current_step_id: 'step-implement'
			}),
			steps: [
				buildStep({ id: 'step-plan', sequence: 1, step_kind: 'plan', status: 'completed' }),
				buildStep({
					id: 'step-implement',
					sequence: 2,
					step_kind: 'implement',
					status: 'needs_human',
					linked_run_id: 'run-needs',
					summary: 'Threshold confirmation needed.'
				}),
				buildStep({ id: 'step-review', sequence: 3, step_kind: 'review', status: 'pending' })
			]
		}
		setTasks(taskWithSteps)
		render(wrap(<ExecutionLog issue={buildIssue()} />))

		const banner = screen.getByRole('region', { name: /needs your decision/i })
		expect(banner).toBeInTheDocument()
		expect(within(banner).getByRole('button', { name: /approve/i })).toBeInTheDocument()
		expect(within(banner).getByRole('button', { name: /reject/i })).toBeInTheDocument()
		expect(within(banner).getByRole('button', { name: /comment/i })).toBeInTheDocument()

		const user = userEvent.setup()
		await user.click(within(banner).getByRole('button', { name: /approve/i }))
		expect(mocks.retryMutate).toHaveBeenCalled()
	})

	it('done: state chip "shipped"; Past runs section collapsed by default and opens on click', async () => {
		const latest: LaunchTaskWithSteps = {
			task: buildTask({
				id: 'task-done',
				status: 'completed' satisfies LaunchTaskStatus,
				updated_at: '2026-05-26T09:55:00.000Z'
			}),
			steps: [
				buildStep({ id: 'step-plan', sequence: 1, step_kind: 'plan', status: 'completed' }),
				buildStep({
					id: 'step-implement',
					sequence: 2,
					step_kind: 'implement',
					status: 'completed',
					linked_run_id: 'run-done'
				}),
				buildStep({ id: 'step-review', sequence: 3, step_kind: 'review', status: 'completed' })
			]
		}
		const older: LaunchTaskWithSteps = {
			task: buildTask({
				id: 'task-older',
				status: 'failed' satisfies LaunchTaskStatus,
				updated_at: '2026-05-25T09:00:00.000Z'
			}),
			steps: [
				buildStep({
					id: 'step-impl-older',
					step_kind: 'implement',
					status: 'failed',
					linked_run_id: 'run-older'
				})
			]
		}
		setTasks(latest, [older])

		render(
			wrap(
				<ExecutionLog
					issue={buildIssue({
						linked_runs: [
							{
								id: 'run-done',
								state: 'completed',
								started_at: '2026-05-26T09:00:00.000Z',
								finished_at: '2026-05-26T09:55:00.000Z'
							}
						]
					})}
				/>,
				{
					run: {
						id: 'run-done',
						issue_id: 'issue-1',
						issue_identifier: 'SUP-181',
						repo_slug: 'superkick',
						state: 'completed',
						trigger_source: 'task',
						current_step_key: null,
						base_branch: 'main',
						worktree_path: '/tmp/wt/sup-181',
						branch_name: 'sup-181-inline-execution-log',
						operator_instructions: null,
						started_at: '2026-05-26T09:00:00.000Z',
						updated_at: '2026-05-26T09:55:00.000Z',
						finished_at: '2026-05-26T09:55:00.000Z',
						error_message: null,
						budget: { duration_secs: null, retries_max: null, token_ceiling: null },
						pause_kind: 'none',
						pause_reason: null
					},
					steps: [],
					sessions: [],
					interrupts: [],
					attention_requests: [],
					pr: null
				}
			)
		)

		expect(screen.getByText('Completed')).toBeInTheDocument()
		expect(screen.getByText('sup-181-inline-execution-log')).toBeInTheDocument()

		const toggle = screen.getByRole('button', { name: /past runs/i })
		expect(toggle).toHaveAttribute('aria-expanded', 'false')
		const user = userEvent.setup()
		await user.click(toggle)
		expect(toggle).toHaveAttribute('aria-expanded', 'true')
		expect(
			screen.getByRole('button', { name: /open run drawer for task task-older/i })
		).toBeInTheDocument()
	})

	it('running: renders Recent activity + Files changed sections from step data and opens the drawer', async () => {
		const taskWithSteps: LaunchTaskWithSteps = {
			task: buildTask({ status: 'running' satisfies LaunchTaskStatus }),
			steps: [
				buildStep({
					id: 'step-plan',
					sequence: 1,
					step_kind: 'plan',
					status: 'completed',
					summary: 'Mapped the migration plan'
				}),
				buildStep({
					id: 'step-implement',
					sequence: 2,
					step_kind: 'implement',
					status: 'running',
					linked_run_id: 'run-running',
					summary: 'Editing the storage layer',
					structured_result: {
						status: 'completed',
						summary: '',
						changed_files: ['ui/src/a.tsx', 'ui/src/b.tsx'],
						questions: []
					}
				}),
				buildStep({ id: 'step-review', sequence: 3, step_kind: 'review', status: 'pending' })
			]
		}
		setTasks(taskWithSteps)
		render(
			wrap(
				<ExecutionLog
					issue={buildIssue({
						linked_runs: [
							{
								id: 'run-running',
								state: 'coding',
								started_at: '2026-05-26T09:30:00.000Z',
								finished_at: null
							}
						]
					})}
				/>
			)
		)

		expect(screen.getByText('Editing the storage layer')).toBeInTheDocument()
		expect(screen.getByText('Mapped the migration plan')).toBeInTheDocument()
		const filePath = (path: string) => (_content: string, element: Element | null) =>
			element?.classList.contains('filerow__path') === true && element.textContent === path
		expect(screen.getByText(filePath('ui/src/a.tsx'))).toBeInTheDocument()
		expect(screen.getByText(filePath('ui/src/b.tsx'))).toBeInTheDocument()

		const user = userEvent.setup()
		await user.click(screen.getByRole('button', { name: /all in drawer/i }))
		expect(mocks.openDrawer).toHaveBeenCalledWith('run-running', 'activity')

		await user.click(screen.getByRole('button', { name: /^diff$/i }))
		expect(mocks.openDrawer).toHaveBeenCalledWith('run-running', 'files')
	})

	it('run_only: an active bare run with no launch task renders the Active run card and opens the drawer', async () => {
		setTasks(null)
		const bareRun: LinkedRunSummary = {
			id: 'run-bare',
			state: 'coding',
			started_at: '2026-05-26T09:30:00.000Z',
			finished_at: null
		}
		render(wrap(<ExecutionLog issue={buildIssue({ linked_runs: [bareRun] })} />))

		expect(screen.getByText('Active run')).toBeInTheDocument()
		expect(screen.getByText('Coding')).toBeInTheDocument()
		expect(screen.queryByText('No execution yet on this issue.')).toBeNull()

		const user = userEvent.setup()
		await user.click(screen.getByRole('button', { name: /open run/i }))
		expect(mocks.openDrawer).toHaveBeenCalledWith('run-bare', 'activity')
	})

	it('run_only: a terminal bare run with no launch task stays idle so the Launch task CTA is preserved', () => {
		setTasks(null)
		const terminalRun: LinkedRunSummary = {
			id: 'run-old',
			state: 'completed',
			started_at: '2026-05-25T09:00:00.000Z',
			finished_at: '2026-05-25T09:30:00.000Z'
		}
		render(wrap(<ExecutionLog issue={buildIssue({ linked_runs: [terminalRun] })} />))

		expect(screen.getByText('No execution yet on this issue.')).toBeInTheDocument()
		expect(screen.getByText('Launch task')).toBeInTheDocument()
		expect(screen.queryByText('Active run')).toBeNull()
	})

	it('run_only: the loading skeleton wins over the Active run card while tasks first-fetch', () => {
		setTasks(null, [], { loading: true })
		const bareRun: LinkedRunSummary = {
			id: 'run-bare',
			state: 'coding',
			started_at: '2026-05-26T09:30:00.000Z',
			finished_at: null
		}
		render(wrap(<ExecutionLog issue={buildIssue({ linked_runs: [bareRun] })} />))

		expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
		expect(screen.queryByText('Active run')).toBeNull()
	})
})
