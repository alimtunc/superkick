import type { ReactNode } from 'react'

import { useUpdateIssue } from '@/hooks/useUpdateIssue'
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
		linked_runs: [],
		...overrides
	}
}

function wrapper(client: QueryClient) {
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	)
}

function makeClient(detail: IssueDetailResponse) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	client.setQueryData(queryKeys.issues.detail(detail.id), detail)
	return client
}

beforeEach(() => {
	fetchMock.mockReset()
})

afterEach(() => {
	vi.clearAllMocks()
})

describe('useUpdateIssue', () => {
	it('optimistically applies the merge and primes the cache from the server payload', async () => {
		const detail = makeDetail()
		const updated = makeDetail({
			priority: { value: 1, label: 'Urgent' },
			updated_at: '2026-05-02T00:00:00Z'
		})
		let resolveFetch: (value: Response) => void = () => {}
		fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveFetch = resolve)))

		const client = makeClient(detail)
		const { result } = renderHook(() => useUpdateIssue(detail.id), { wrapper: wrapper(client) })

		act(() => {
			result.current.mutate({
				patch: { priority: 1 },
				optimistic: (previous) => ({ ...previous, priority: { value: 1, label: 'Urgent' } })
			})
		})

		await waitFor(() => {
			const snap = client.getQueryData<IssueDetailResponse>(queryKeys.issues.detail(detail.id))
			expect(snap?.priority.value).toBe(1)
			expect(snap?.priority.label).toBe('Urgent')
		})

		await act(async () => {
			resolveFetch(
				new Response(JSON.stringify(updated), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			)
		})
		await waitFor(() => expect(result.current.isSuccess).toBe(true))

		const final = client.getQueryData<IssueDetailResponse>(queryKeys.issues.detail(detail.id))
		expect(final?.updated_at).toBe('2026-05-02T00:00:00Z')
	})

	it('rolls back the snapshot on error and surfaces the linear message', async () => {
		const detail = makeDetail({ priority: { value: 3, label: 'Medium' } })
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: 'priority must be 0..=4' }), {
				status: 422,
				headers: { 'Content-Type': 'application/json' }
			})
		)
		const client = makeClient(detail)
		const { result } = renderHook(() => useUpdateIssue(detail.id), { wrapper: wrapper(client) })

		await act(async () => {
			result.current.mutate({
				patch: { priority: 9 },
				optimistic: (previous) => ({ ...previous, priority: { value: 9, label: 'invalid' } })
			})
		})

		await waitFor(() => expect(result.current.isError).toBe(true))

		const snap = client.getQueryData<IssueDetailResponse>(queryKeys.issues.detail(detail.id))
		expect(snap?.priority.value).toBe(3)
		expect(result.current.error?.message).toBe('priority must be 0..=4')
	})

	it('strips undefined keys but sends null clears', async () => {
		const detail = makeDetail({ assignee: { id: 'u1', name: 'Alice', avatar_url: null } })
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(makeDetail({ assignee: null })), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		)
		const client = makeClient(detail)
		const { result } = renderHook(() => useUpdateIssue(detail.id), { wrapper: wrapper(client) })

		await act(async () => {
			result.current.mutate({
				patch: { assignee_id: null },
				optimistic: (previous) => ({ ...previous, assignee: null })
			})
		})

		await waitFor(() => expect(result.current.isSuccess).toBe(true))
		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [, init] = fetchMock.mock.calls[0]
		const sent = JSON.parse(String((init as RequestInit).body))
		expect(sent).toEqual({ assignee_id: null })
	})
})
