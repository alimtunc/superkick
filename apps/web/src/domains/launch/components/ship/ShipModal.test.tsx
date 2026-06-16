import type { ReactNode } from 'react'

import type { IssueDetailResponse, LinearOptions, ShipRunResponse } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ShipModal } from './ShipModal'

const mocks = vi.hoisted(() => ({
	shipRun: vi.fn(),
	createIssueComment: vi.fn(),
	patchIssue: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	toastWarning: vi.fn()
}))

const OPTIONS: LinearOptions = {
	teams: [],
	users: [],
	projects: [],
	labels: [],
	workflow_states_by_team: {
		'team-1': [
			{ id: 's-prog', name: 'In Progress', state_type: 'started', color: '#fff', position: 1 },
			{ id: 's-rev', name: 'In Review', state_type: 'started', color: '#fff', position: 2 },
			{ id: 's-done', name: 'Done', state_type: 'completed', color: '#fff', position: 3 }
		]
	}
}

vi.mock('@/api', async () => {
	const actual = await vi.importActual<typeof import('@/api')>('@/api')
	return {
		...actual,
		shipRun: mocks.shipRun,
		createIssueComment: mocks.createIssueComment,
		patchIssue: mocks.patchIssue
	}
})

vi.mock('@/hooks/useLinearOptions', () => ({ useLinearOptions: () => ({ data: OPTIONS }) }))
vi.mock('sonner', () => ({
	toast: { success: mocks.toastSuccess, error: mocks.toastError, warning: mocks.toastWarning }
}))

const SHIP_RESULT: ShipRunResponse = {
	pushedBranch: 'feat/sup-195',
	pr: { number: 7, state: 'draft', url: 'https://x/pull/7' } as ShipRunResponse['pr']
}

function buildIssue(teamId: string | null = 'team-1'): IssueDetailResponse {
	return {
		id: 'issue-1',
		identifier: 'SUP-195',
		title: 'Review and ship',
		team_id: teamId
	} as unknown as IssueDetailResponse
}

function renderModal(issue = buildIssue(), prExists = false) {
	const onOpenChange = vi.fn()
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	)
	render(
		<ShipModal
			open
			onOpenChange={onOpenChange}
			issue={issue}
			taskId="task-1"
			runId="run-1"
			baseBranch="main"
			headBranch="feat/sup-195"
			prExists={prExists}
			defaultTitle="Review and ship"
			summary="Did the work"
			changedFiles={['src/a.ts']}
		/>,
		{ wrapper }
	)
	return { onOpenChange }
}

beforeEach(() => {
	mocks.shipRun.mockReset().mockResolvedValue(SHIP_RESULT)
	mocks.createIssueComment.mockReset().mockResolvedValue({})
	mocks.patchIssue.mockReset().mockResolvedValue({})
	mocks.toastSuccess.mockReset()
	mocks.toastError.mockReset()
	mocks.toastWarning.mockReset()
})

describe('ShipModal', () => {
	it('submits a draft PR with the composed title and body by default', async () => {
		const user = userEvent.setup()
		renderModal()

		await user.click(screen.getByRole('button', { name: 'Create draft PR' }))

		await waitFor(() => expect(mocks.shipRun).toHaveBeenCalledTimes(1))
		const [runId, body] = mocks.shipRun.mock.calls[0]
		expect(runId).toBe('run-1')
		expect(body.mode).toBe('draft')
		expect(body.title).toBe('Review and ship')
		expect(body.body).toContain('Did the work')
		expect(body.body).toContain('src/a.ts')
	})

	it('sends an empty body for push-branch-only', async () => {
		const user = userEvent.setup()
		renderModal()

		await user.click(screen.getByRole('radio', { name: /Push branch only/ }))
		await user.click(screen.getByRole('button', { name: 'Push branch' }))

		await waitFor(() => expect(mocks.shipRun).toHaveBeenCalledTimes(1))
		expect(mocks.shipRun.mock.calls[0][1]).toMatchObject({ mode: 'push_only', body: '' })
	})

	it('requires explicit confirmation before opening a ready PR', async () => {
		const user = userEvent.setup()
		renderModal()

		await user.click(screen.getByRole('radio', { name: /Ready PR/ }))
		await user.click(screen.getByRole('button', { name: 'Create ready PR' }))

		// The confirm step gates the actual ship call.
		expect(mocks.shipRun).not.toHaveBeenCalled()
		await user.click(screen.getByRole('button', { name: 'Open ready PR' }))

		await waitFor(() => expect(mocks.shipRun).toHaveBeenCalledTimes(1))
		expect(mocks.shipRun.mock.calls[0][1]).toMatchObject({ mode: 'ready' })
	})

	it('posts a Linear comment and moves status to the resolved In Review state', async () => {
		const user = userEvent.setup()
		renderModal()

		await user.type(screen.getByLabelText('Linear comment'), 'shipping it')
		await user.click(screen.getByRole('button', { name: 'In Review' }))
		await user.click(screen.getByRole('button', { name: 'Create draft PR' }))

		await waitFor(() => expect(mocks.shipRun).toHaveBeenCalledTimes(1))
		expect(mocks.createIssueComment).toHaveBeenCalledWith('issue-1', 'shipping it')
		expect(mocks.patchIssue).toHaveBeenCalledWith('issue-1', { state_id: 's-rev', team_id: 'team-1' })
	})

	it('disables Linear options when the issue has no team', () => {
		renderModal(buildIssue(null))
		expect(screen.getByText(/Linear is not configured/)).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'In Review' })).not.toBeInTheDocument()
	})

	it('includes the edited head branch in the ship payload', async () => {
		const user = userEvent.setup()
		renderModal()

		const input = screen.getByLabelText('Head branch')
		await user.clear(input)
		await user.type(input, 'feat/renamed')
		await user.click(screen.getByRole('button', { name: 'Create draft PR' }))

		await waitFor(() => expect(mocks.shipRun).toHaveBeenCalledTimes(1))
		expect(mocks.shipRun.mock.calls[0][1]).toMatchObject({ headBranch: 'feat/renamed' })
	})

	it('omits headBranch when the input is left unedited', async () => {
		const user = userEvent.setup()
		renderModal()

		await user.click(screen.getByRole('button', { name: 'Create draft PR' }))

		await waitFor(() => expect(mocks.shipRun).toHaveBeenCalledTimes(1))
		expect('headBranch' in mocks.shipRun.mock.calls[0][1]).toBe(false)
	})

	it('shows an inline error and disables submit for an invalid head branch', async () => {
		const user = userEvent.setup()
		renderModal()

		const input = screen.getByLabelText('Head branch')
		await user.clear(input)
		await user.type(input, 'bad..name')

		const error = screen.getByText('Branch names cannot contain ".."')
		expect(input).toHaveAttribute('aria-describedby', error.id)
		expect(screen.getByRole('button', { name: 'Create draft PR' })).toBeDisabled()
		expect(mocks.shipRun).not.toHaveBeenCalled()
	})

	it('locks the head branch input when a PR already exists', () => {
		renderModal(buildIssue(), true)

		const input = screen.getByLabelText('Head branch')
		expect(input).toBeDisabled()
		const hint = screen.getByText(/Head branch is locked/)
		expect(input).toHaveAttribute('aria-describedby', hint.id)
	})

	it('reports PR success and closes even when a Linear write fails', async () => {
		const user = userEvent.setup()
		mocks.createIssueComment.mockRejectedValue(new Error('linear down'))
		const { onOpenChange } = renderModal()

		await user.type(screen.getByLabelText('Linear comment'), 'note')
		await user.click(screen.getByRole('button', { name: 'Create draft PR' }))

		await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled())
		expect(onOpenChange).toHaveBeenCalledWith(false)
		expect(mocks.toastWarning).toHaveBeenCalled()
		expect(mocks.toastError).not.toHaveBeenCalled()
	})
})
