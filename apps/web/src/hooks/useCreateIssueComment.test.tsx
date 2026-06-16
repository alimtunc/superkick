import type { ReactNode } from 'react'

import { useCreateIssueComment } from '@/hooks/useCreateIssueComment'
import { queryKeys } from '@/lib/queryKeys'
import type { IssueDetailResponse, ViewerResponse } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

vi.mock('sonner', () => ({
	toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() }
}))

const VIEWER: ViewerResponse = { id: 'viewer-1', name: 'Alex', avatar_url: null }

function makeDetail(): IssueDetailResponse {
	return {
		id: 'issue-uuid',
		identifier: 'SUP-1',
		title: 'demo',
		status: { state_type: 'unstarted', name: 'Todo', color: '#fff' },
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

function wrapper(client: QueryClient) {
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	)
}

beforeEach(() => {
	fetchMock.mockReset()
})

afterEach(() => {
	vi.clearAllMocks()
})

describe('useCreateIssueComment', () => {
	it('optimistically appends a temp comment, then invalidates on success', async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		client.setQueryData(queryKeys.issues.detail('issue-uuid'), makeDetail())

		let resolveFetch: (value: Response) => void = () => {}
		fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveFetch = resolve)))

		const { result } = renderHook(() => useCreateIssueComment('issue-uuid', VIEWER), {
			wrapper: wrapper(client)
		})

		act(() => {
			result.current.mutate('hello world')
		})

		await waitFor(() => {
			const snap = client.getQueryData<IssueDetailResponse>(queryKeys.issues.detail('issue-uuid'))
			expect(snap?.comments).toHaveLength(1)
			expect(snap?.comments[0]?.id.startsWith('temp:')).toBe(true)
			expect(snap?.comments[0]?.body).toBe('hello world')
			expect(snap?.comments[0]?.author?.id).toBe(VIEWER.id)
		})

		await act(async () => {
			resolveFetch(
				new Response(
					JSON.stringify({
						id: 'comment-real',
						body: 'hello world',
						author: { id: VIEWER.id, name: VIEWER.name, avatar_url: null },
						created_at: '2026-05-02T00:00:00Z',
						updated_at: '2026-05-02T00:00:00Z',
						parent_id: null
					}),
					{ status: 201, headers: { 'Content-Type': 'application/json' } }
				)
			)
		})
		await waitFor(() => expect(result.current.isSuccess).toBe(true))
	})

	it('rolls back when the post fails and surfaces the server message', async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		client.setQueryData(queryKeys.issues.detail('issue-uuid'), makeDetail())

		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: 'rejected by Linear' }), {
				status: 422,
				headers: { 'Content-Type': 'application/json' }
			})
		)

		const { result } = renderHook(() => useCreateIssueComment('issue-uuid', VIEWER), {
			wrapper: wrapper(client)
		})

		await act(async () => {
			result.current.mutate('nope')
		})

		await waitFor(() => expect(result.current.isError).toBe(true))
		const snap = client.getQueryData<IssueDetailResponse>(queryKeys.issues.detail('issue-uuid'))
		expect(snap?.comments).toHaveLength(0)
		expect(result.current.error?.message).toBe('rejected by Linear')
	})
})
