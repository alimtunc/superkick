import type { ReactNode } from 'react'

import { useCreateIssue } from '@/hooks/useCreateIssue'
import { queryKeys } from '@/lib/queryKeys'
import type { IssueDetailResponse } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

vi.mock('sonner', () => ({
	toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() }
}))

function makeDetail(overrides: Partial<IssueDetailResponse> = {}): IssueDetailResponse {
	return {
		id: 'new-uuid',
		identifier: 'SUP-42',
		title: 'New issue',
		status: { state_type: 'unstarted', name: 'Todo', color: '#fff' },
		priority: { value: 3, label: 'Medium' },
		url: 'https://linear/SUP-42',
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
		linked_runs: [],
		...overrides
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

describe('useCreateIssue', () => {
	it('POSTs the body and primes the detail cache with the server response', async () => {
		const detail = makeDetail()
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(detail), {
				status: 201,
				headers: { 'Content-Type': 'application/json' }
			})
		)
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const { result } = renderHook(() => useCreateIssue(), { wrapper: wrapper(client) })

		await act(async () => {
			result.current.mutate({ team_id: 'team-1', title: 'New issue' })
		})

		await waitFor(() => expect(result.current.isSuccess).toBe(true))
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe('/api/issues')
		expect((init as RequestInit).method).toBe('POST')
		expect(JSON.parse(String((init as RequestInit).body))).toEqual({
			team_id: 'team-1',
			title: 'New issue'
		})

		const cached = client.getQueryData<IssueDetailResponse>(queryKeys.issues.detail(detail.id))
		expect(cached?.identifier).toBe('SUP-42')
	})

	it('surfaces the 422 user-presentable message verbatim', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: 'Title is required' }), {
				status: 422,
				headers: { 'Content-Type': 'application/json' }
			})
		)
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const { result } = renderHook(() => useCreateIssue(), { wrapper: wrapper(client) })

		await act(async () => {
			result.current.mutate({ team_id: 'team-1', title: '   ' })
		})

		await waitFor(() => expect(result.current.isError).toBe(true))
		expect(result.current.error?.message).toBe('Title is required')
	})

	it('shows the setup-needed message when LINEAR_API_KEY is missing', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: 'LINEAR_API_KEY not configured' }), {
				status: 503,
				headers: { 'Content-Type': 'application/json' }
			})
		)
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const { result } = renderHook(() => useCreateIssue(), { wrapper: wrapper(client) })

		await act(async () => {
			result.current.mutate({ team_id: 'team-1', title: 'x' })
		})

		await waitFor(() => expect(result.current.isError).toBe(true))
		expect(result.current.error?.message).toContain('Linear isn’t configured')
	})
})
