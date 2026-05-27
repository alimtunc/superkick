import type { ReactNode } from 'react'

import { IssueDescription } from '@/components/issue-detail/IssueDescription'
import type { IssueDetailResponse } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

vi.mock('sonner', () => ({
	toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() }
}))

beforeEach(() => {
	fetchMock.mockReset()
})

afterEach(() => {
	vi.clearAllMocks()
})

function wrapper(client: QueryClient) {
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	)
}

function makeIssue(description: string): IssueDetailResponse {
	return {
		id: 'issue-1',
		identifier: 'SUP-1',
		title: 'demo',
		status: { state_type: 'unstarted', name: 'Todo', color: '#888' },
		priority: { value: 3, label: 'Medium' },
		url: 'https://linear/SUP-1',
		created_at: '2026-05-01T00:00:00Z',
		updated_at: '2026-05-01T00:00:00Z',
		description,
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

describe('IssueDescription', () => {
	it('renders Linear markdown as structured issue copy instead of raw text', () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const issue = makeIssue(
			[
				'## Context',
				'Task Cockpit still feels inconsistent with the approved mockups.',
				'',
				'• [SUP-169](https://linear.app/superkick/issue/SUP-169) — visual parity harness.',
				'• Rework `/tasks/:id` to match Task Cockpit artboards.'
			].join('\n')
		)

		render(<IssueDescription issue={issue} />, { wrapper: wrapper(client) })

		expect(screen.getByRole('heading', { name: 'Context', level: 2 })).toBeInTheDocument()
		expect(screen.queryByText('## Context')).not.toBeInTheDocument()
		expect(
			screen.getByText('Task Cockpit still feels inconsistent with the approved mockups.')
		).toBeInTheDocument()

		const list = screen.getByRole('list')
		expect(within(list).getAllByRole('listitem')).toHaveLength(2)
		expect(screen.getByRole('link', { name: 'SUP-169' })).toHaveAttribute(
			'href',
			'https://linear.app/superkick/issue/SUP-169'
		)
		expect(screen.getByText('/tasks/:id')).toBeInTheDocument()
	})

	it('saves an edited description via PATCH and primes the cache with the response', async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const issue = makeIssue('Original body.')
		const user = userEvent.setup()

		const updated: IssueDetailResponse = { ...issue, description: 'New body.' }
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(updated), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		)

		render(<IssueDescription issue={issue} />, { wrapper: wrapper(client) })

		await user.click(screen.getByRole('button', { name: 'Edit description' }))

		const textarea = screen.getByRole('textbox', { name: 'Description' })
		await user.clear(textarea)
		await user.type(textarea, 'New body.')
		await user.click(screen.getByRole('button', { name: 'Save' }))

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe('/api/issues/issue-1')
		expect((init as RequestInit).method).toBe('PATCH')
		expect(JSON.parse(String((init as RequestInit).body))).toEqual({ description: 'New body.' })
	})

	it('cancels an edit without firing PATCH and restores the original description', async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const issue = makeIssue('Original body.')
		const user = userEvent.setup()

		render(<IssueDescription issue={issue} />, { wrapper: wrapper(client) })

		await user.click(screen.getByRole('button', { name: 'Edit description' }))
		const textarea = screen.getByRole('textbox', { name: 'Description' })
		await user.clear(textarea)
		await user.type(textarea, 'Scratch.')
		await user.click(screen.getByRole('button', { name: 'Cancel' }))

		expect(fetchMock).not.toHaveBeenCalled()
		expect(screen.getByText('Original body.')).toBeInTheDocument()
	})
})
