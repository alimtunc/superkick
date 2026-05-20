import type { ReactNode } from 'react'

import { IssueContextPanel } from '@/components/issues/IssueContextPanel'
import { queryKeys } from '@/lib/queryKeys'
import type { IssueWorkspaceContext, MemoryEntriesPage } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ISSUE_ID = 'SUP-151'

const CONTEXT: IssueWorkspaceContext = {
	snapshot: {
		id: 'lin-1',
		identifier: ISSUE_ID,
		title: 'Surface workspace context',
		description: 'Render snapshot + memory in the issue page.',
		status: { state_type: 'started', name: 'In Progress', color: '#5b6ef2' },
		captured_at: '2026-05-19T08:00:00Z'
	},
	comment_excerpts: [],
	linked_items: []
}

const mocks = vi.hoisted(() => ({
	fetchIssueWorkspaceContext: vi.fn(),
	fetchIssueMemoryEntries: vi.fn()
}))

vi.mock('@/api/issueContext', () => mocks)

function makeClient() {
	return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function withClient(client: QueryClient, node: ReactNode) {
	return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

describe('IssueContextPanel', () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true })
		vi.setSystemTime(new Date('2026-05-19T09:00:00Z'))
		mocks.fetchIssueWorkspaceContext.mockReset()
		mocks.fetchIssueMemoryEntries.mockReset()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('renders loading skeletons while the workspace context query is pending', () => {
		mocks.fetchIssueWorkspaceContext.mockReturnValue(new Promise(() => {}))
		mocks.fetchIssueMemoryEntries.mockReturnValue(new Promise(() => {}))

		const client = makeClient()
		render(withClient(client, <IssueContextPanel issueId={ISSUE_ID} variant="inline" />))

		const busy = screen.getAllByRole('status', { busy: true })
		expect(busy.length).toBeGreaterThan(0)
	})

	it('renders empty states when the workspace context has no excerpts, links, or memory', async () => {
		const client = makeClient()
		client.setQueryData(queryKeys.issues.workspaceContext(ISSUE_ID), CONTEXT)
		const emptyMemory: MemoryEntriesPage = { entries: [], next_cursor: null }
		client.setQueryData(queryKeys.issues.memory(ISSUE_ID), {
			pages: [emptyMemory],
			pageParams: [null]
		})

		render(withClient(client, <IssueContextPanel issueId={ISSUE_ID} variant="inline" />))

		expect(await screen.findByText('Surface workspace context')).toBeInTheDocument()
		expect(screen.getByText('No comment excerpts')).toBeInTheDocument()
		expect(screen.getByText('No linked items')).toBeInTheDocument()
		expect(screen.getByText('Memory empty')).toBeInTheDocument()
	})

	it('surfaces an error state in every section when the workspace context query fails', async () => {
		mocks.fetchIssueWorkspaceContext.mockRejectedValue(new Error('boom'))
		mocks.fetchIssueMemoryEntries.mockResolvedValue({ entries: [], next_cursor: null })

		const client = makeClient()
		render(withClient(client, <IssueContextPanel issueId={ISSUE_ID} variant="inline" />))

		expect(await screen.findByText('Snapshot unavailable')).toBeInTheDocument()
		expect(screen.getByText('Comments unavailable')).toBeInTheDocument()
		expect(screen.getByText('Linked items unavailable')).toBeInTheDocument()
	})

	it('reveals more memory entries when "Load more" is clicked and a next cursor exists', async () => {
		const client = makeClient()
		client.setQueryData(queryKeys.issues.workspaceContext(ISSUE_ID), CONTEXT)

		const firstPage: MemoryEntriesPage = {
			entries: [
				{
					id: 'mem-1',
					role: 'decision',
					author: 'planner',
					text: 'Adopt the section composition pattern.',
					created_at: '2026-05-19T08:30:00Z'
				}
			],
			next_cursor: 'cursor-2'
		}
		client.setQueryData(queryKeys.issues.memory(ISSUE_ID), {
			pages: [firstPage],
			pageParams: [null]
		})

		const secondPage: MemoryEntriesPage = {
			entries: [
				{
					id: 'mem-2',
					role: 'fact',
					author: 'reviewer',
					text: 'Memory pagination uses cursor pagination.',
					created_at: '2026-05-19T08:45:00Z'
				}
			],
			next_cursor: null
		}
		mocks.fetchIssueMemoryEntries.mockResolvedValueOnce(secondPage)

		render(withClient(client, <IssueContextPanel issueId={ISSUE_ID} variant="inline" />))

		expect(await screen.findByText('Adopt the section composition pattern.')).toBeInTheDocument()

		const loadMore = screen.getByRole('button', { name: /load more/i })
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
		await user.click(loadMore)

		expect(await screen.findByText('Memory pagination uses cursor pagination.')).toBeInTheDocument()
		expect(mocks.fetchIssueMemoryEntries).toHaveBeenCalledWith(ISSUE_ID, 'cursor-2')
		await waitFor(() => {
			expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument()
		})
	})
})
