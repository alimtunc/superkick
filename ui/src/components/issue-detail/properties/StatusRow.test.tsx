import type { ReactNode } from 'react'

import { StatusRow } from '@/components/issue-detail/properties/StatusRow'
import { queryKeys } from '@/lib/queryKeys'
import type { IssueDetailResponse, LinearOptions } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

vi.mock('sonner', () => ({
	toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() }
}))

function makeIssue(): IssueDetailResponse {
	return {
		id: 'issue-uuid',
		identifier: 'SUP-1',
		title: 'demo',
		status: { state_type: 'unstarted', name: 'Todo', color: '#888' },
		priority: { value: 3, label: 'Medium' },
		url: 'https://linear/SUP-1',
		created_at: '2026-05-01T00:00:00Z',
		updated_at: '2026-05-01T00:00:00Z',
		description: '',
		labels: [],
		assignee: null,
		project: null,
		cycle: null,
		estimate: null,
		due_date: null,
		parent: null,
		children: [],
		blocked_by: [],
		team_id: 'team-1',
		comments: [],
		linked_runs: []
	}
}

function makeOptions(): LinearOptions {
	return {
		teams: [],
		users: [],
		projects: [],
		labels: [],
		workflow_states_by_team: {
			'team-1': [
				{ id: 'state-todo', name: 'Todo', state_type: 'unstarted', color: '#888', position: 1 },
				{
					id: 'state-progress',
					name: 'In Progress',
					state_type: 'started',
					color: '#16a34a',
					position: 2
				}
			]
		}
	}
}

function wrapper(client: QueryClient) {
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	)
}

function makeClient(issue: IssueDetailResponse) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	client.setQueryData(queryKeys.linearOptions.all, makeOptions())
	client.setQueryData(queryKeys.issues.detail(issue.id), issue)
	return client
}

beforeEach(() => {
	fetchMock.mockReset()
})

afterEach(() => {
	vi.clearAllMocks()
})

describe('StatusRow', () => {
	it('opens the picker and PATCHes the chosen status, optimistically updating the chip', async () => {
		const issue = makeIssue()
		const updated: IssueDetailResponse = {
			...issue,
			status: { state_type: 'started', name: 'In Progress', color: '#16a34a' }
		}
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(updated), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		)
		const client = makeClient(issue)
		const user = userEvent.setup()

		render(<StatusRow issue={issue} />, { wrapper: wrapper(client) })

		await user.click(screen.getByRole('button', { name: 'Change status' }))
		const option = await screen.findByRole('option', { name: /In Progress/ })
		await user.click(option)

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe('/api/issues/issue-uuid')
		expect((init as RequestInit).method).toBe('PATCH')
		expect(JSON.parse(String((init as RequestInit).body))).toEqual({
			state_id: 'state-progress'
		})

		await waitFor(() => {
			const snap = client.getQueryData<IssueDetailResponse>(queryKeys.issues.detail(issue.id))
			expect(snap?.status.name).toBe('In Progress')
		})
	})
})
