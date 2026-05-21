import type { ReactNode } from 'react'

import { useUpdateIssueState } from '@/hooks/useUpdateIssueState'
import { queryKeys } from '@/lib/queryKeys'
import type { LaunchQueueResponse } from '@/types'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

vi.mock('sonner', () => ({
	toast: {
		error: vi.fn(),
		info: vi.fn(),
		success: vi.fn()
	}
}))

function snapshot(): LaunchQueueResponse {
	return {
		generated_at: '2026-05-21T10:00:00Z',
		active_capacity: { current: 0, max: 3 },
		groups: {
			backlog: [],
			todo: [issueItem('SUP-1', 'issue-uuid', 'unstarted')],
			launchable: [],
			waiting: [],
			blocked: [],
			active: [],
			'needs-human': [],
			'in-pr': [],
			done: []
		}
	}
}

function issueItem(identifier: string, id: string, stateType: 'unstarted' | 'started' | 'completed') {
	return {
		kind: 'issue' as const,
		bucket: 'todo' as const,
		reason: 'test',
		issue: {
			id,
			identifier,
			title: 'demo',
			status: { state_type: stateType, name: stateType, color: '#fff' },
			team_id: 'team-1',
			priority: { value: 3, label: 'Medium' },
			labels: [],
			assignee: null,
			project: null,
			parent: null,
			children: [],
			blocked_by: [],
			url: '',
			created_at: '2026-05-01T00:00:00Z',
			updated_at: '2026-05-01T00:00:00Z'
		}
	}
}

function withClient(client: QueryClient) {
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	)
}

function makeClient() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
	client.setQueryData(queryKeys.launchQueue.all, snapshot())
	return client
}

beforeEach(() => {
	fetchMock.mockReset()
})

afterEach(() => {
	vi.clearAllMocks()
})

describe('useUpdateIssueState', () => {
	it('PATCHes the issue id with a snake_case state', async () => {
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
		const client = makeClient()
		const { result } = renderHook(() => useUpdateIssueState(), { wrapper: withClient(client) })

		await act(async () => {
			result.current.mutate({
				issueId: 'issue-uuid',
				issueIdentifier: 'SUP-1',
				teamId: 'team-1',
				to: 'in_progress'
			})
		})

		await waitFor(() => expect(result.current.isSuccess).toBe(true))

		expect(fetchMock).toHaveBeenCalledTimes(1)
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe('/api/issues/issue-uuid')
		expect((init as RequestInit).method).toBe('PATCH')
		expect(JSON.parse(String((init as RequestInit).body))).toEqual({
			state: 'in_progress',
			team_id: 'team-1'
		})
	})

	it('optimistically moves the item and rewrites its linear state', async () => {
		let resolveFetch: (value: Response) => void = () => {}
		fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveFetch = resolve)))

		const client = makeClient()
		const { result } = renderHook(() => useUpdateIssueState(), { wrapper: withClient(client) })

		act(() => {
			result.current.mutate({
				issueId: 'issue-uuid',
				issueIdentifier: 'SUP-1',
				teamId: 'team-1',
				to: 'done'
			})
		})

		await waitFor(() => {
			const snap = client.getQueryData<LaunchQueueResponse>(queryKeys.launchQueue.all)
			expect(snap?.groups.todo).toHaveLength(0)
			expect(snap?.groups.done).toHaveLength(1)
			expect(snap?.groups.done[0]?.kind).toBe('issue')
			if (snap?.groups.done[0]?.kind === 'issue') {
				expect(snap.groups.done[0].issue.status.state_type).toBe('completed')
			}
		})

		await act(async () => {
			resolveFetch(new Response(null, { status: 204 }))
		})
		await waitFor(() => expect(result.current.isSuccess).toBe(true))
	})

	it('rolls back the snapshot when the mutation fails', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: 'linear rejected the move' }), { status: 502 })
		)
		const client = makeClient()
		const { result } = renderHook(() => useUpdateIssueState(), { wrapper: withClient(client) })

		await act(async () => {
			result.current.mutate({
				issueId: 'issue-uuid',
				issueIdentifier: 'SUP-1',
				teamId: 'team-1',
				to: 'done'
			})
		})

		await waitFor(() => expect(result.current.isError).toBe(true))

		const snap = client.getQueryData<LaunchQueueResponse>(queryKeys.launchQueue.all)
		expect(snap?.groups.todo).toHaveLength(1)
		expect(snap?.groups.done).toHaveLength(0)
	})
})
