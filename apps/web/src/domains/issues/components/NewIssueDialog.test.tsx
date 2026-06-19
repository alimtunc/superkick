import type { ReactNode } from 'react'

import { NewIssueDialog } from '@/domains/issues/components/NewIssueDialog'
import { queryKeys } from '@/lib/queryKeys'
import type { LinearOptions } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const navigateMock = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
	useNavigate: () => navigateMock
}))

vi.mock('sonner', () => ({
	toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() }
}))

function makeOptions(): LinearOptions {
	return {
		teams: [
			{ id: 'team-1', key: 'SUP', name: 'Superkick' },
			{ id: 'team-2', key: 'OPS', name: 'Ops' }
		],
		users: [{ id: 'user-1', name: 'Alex', avatar_url: null }],
		projects: [],
		labels: [],
		workflow_states_by_team: {
			'team-1': [
				{ id: 'state-todo', name: 'Todo', state_type: 'unstarted', color: '#888', position: 1 }
			]
		}
	}
}

function wrapper(client: QueryClient) {
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	)
}

function makeClient() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	client.setQueryData(queryKeys.linearOptions.all, makeOptions())
	return client
}

beforeEach(() => {
	fetchMock.mockReset()
	navigateMock.mockReset()
})

afterEach(() => {
	vi.clearAllMocks()
})

describe('NewIssueDialog', () => {
	it('disables create until a title is entered', async () => {
		const client = makeClient()
		const onOpenChange = vi.fn()
		const user = userEvent.setup()

		render(<NewIssueDialog open onOpenChange={onOpenChange} defaultTeamId="team-1" />, {
			wrapper: wrapper(client)
		})

		const createBtn = await screen.findByRole('button', { name: 'Create issue' })
		expect(createBtn).toBeDisabled()

		await user.type(screen.getByLabelText('Issue title'), 'Fix the thing')
		expect(createBtn).not.toBeDisabled()
	})

	it('POSTs the body, closes, and navigates to the new issue identifier', async () => {
		const client = makeClient()
		const onOpenChange = vi.fn()
		const user = userEvent.setup()

		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					id: 'new-uuid',
					identifier: 'SUP-99',
					title: 'Fix the thing',
					status: { state_type: 'unstarted', name: 'Todo', color: '#888' },
					priority: { value: 3, label: 'Medium' },
					url: 'https://linear/SUP-99',
					created_at: '2026-05-27T10:00:00Z',
					updated_at: '2026-05-27T10:00:00Z',
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
				}),
				{ status: 201, headers: { 'Content-Type': 'application/json' } }
			)
		)

		render(<NewIssueDialog open onOpenChange={onOpenChange} defaultTeamId="team-1" />, {
			wrapper: wrapper(client)
		})

		await user.type(screen.getByLabelText('Issue title'), 'Fix the thing')
		await user.click(screen.getByRole('button', { name: 'Create issue' }))

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe('/api/issues')
		expect((init as RequestInit).method).toBe('POST')
		const sent = JSON.parse(String((init as RequestInit).body))
		expect(sent.team_id).toBe('team-1')
		expect(sent.title).toBe('Fix the thing')
		expect(sent).not.toHaveProperty('description')

		await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
		expect(navigateMock).toHaveBeenCalledWith({
			to: '/issues/$issueId',
			params: { issueId: 'SUP-99' }
		})
	})
})
