import type { ReactNode } from 'react'

import { useIssueKanbanDnd } from '@/hooks/useIssueKanbanDnd'
import { queryKeys } from '@/lib/queryKeys'
import type { IssueState, LaunchQueueItem, LaunchQueueResponse, LinearStateType } from '@/types'
import type { DragEndEvent } from '@dnd-kit/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toastMocks = vi.hoisted(() => ({
	error: vi.fn(),
	info: vi.fn(),
	success: vi.fn()
}))

vi.mock('sonner', () => ({ toast: toastMocks }))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function issueItem(
	identifier: string,
	stateType: LinearStateType,
	teamId: string | null = 'team-1'
): LaunchQueueItem {
	return {
		kind: 'issue',
		bucket: 'todo',
		reason: 'test',
		issue: {
			id: `id-${identifier}`,
			identifier,
			title: 'demo',
			status: { state_type: stateType, name: stateType, color: '#fff' },
			team_id: teamId,
			priority: { value: 3, label: 'Medium' },
			labels: [],
			assignee: null,
			project: null,
			parent: null,
			children: [],
			blocked_by: [],
			url: '',
			created_at: '2026-05-01T00:00:00Z',
			updated_at: '2026-05-01T00:00:00Z',
			completed_at: null
		}
	}
}

function groupsFor(todo: string[], inProgress: string[]): Record<IssueState, LaunchQueueItem[]> {
	return {
		needs_human: [],
		backlog: [],
		todo: todo.map((id) => issueItem(id, 'unstarted')),
		in_progress: inProgress.map((id) => issueItem(id, 'started')),
		in_review: [],
		done: []
	}
}

function snapshot(groups: Record<IssueState, LaunchQueueItem[]>): LaunchQueueResponse {
	return {
		generated_at: '2026-05-21T10:00:00Z',
		active_capacity: { current: 0, max: 3 },
		groups: {
			backlog: groups.backlog,
			todo: groups.todo,
			launchable: [],
			waiting: [],
			blocked: [],
			active: groups.in_progress,
			'needs-human': groups.needs_human,
			'in-pr': groups.in_review,
			done: groups.done
		}
	}
}

function withClient(client: QueryClient) {
	return ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	)
}

function dragEnd(identifier: string, fromState: IssueState, overId: IssueState | null): DragEndEvent {
	return {
		active: {
			id: identifier,
			data: { current: { fromState } }
		},
		over: overId ? { id: overId, data: { current: {} } } : null
	} as unknown as DragEndEvent
}

beforeEach(() => {
	fetchMock.mockReset()
	toastMocks.error.mockReset()
	toastMocks.info.mockReset()
	toastMocks.success.mockReset()
})

afterEach(() => {
	vi.clearAllMocks()
})

describe('useIssueKanbanDnd onDragEnd', () => {
	it('PATCHes the issue with state + team_id when dragging between persistable columns', async () => {
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
		const groups = groupsFor(['SUP-1'], [])
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		client.setQueryData(queryKeys.launchQueue.all, snapshot(groups))

		const { result } = renderHook(() => useIssueKanbanDnd({ groups }), {
			wrapper: withClient(client)
		})

		await act(async () => {
			result.current.onDragEnd(dragEnd('SUP-1', 'todo', 'in_progress'))
		})

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
		expect(fetchMock.mock.calls[0][0]).toBe('/api/issues/id-SUP-1')
		const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
		expect(body).toEqual({ state: 'in_progress', team_id: 'team-1' })
	})

	it('sends team_id: null when the issue has no team', async () => {
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
		const groups: Record<IssueState, LaunchQueueItem[]> = {
			needs_human: [],
			backlog: [],
			todo: [issueItem('SUP-2', 'unstarted', null)],
			in_progress: [],
			in_review: [],
			done: []
		}
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		client.setQueryData(queryKeys.launchQueue.all, snapshot(groups))

		const { result } = renderHook(() => useIssueKanbanDnd({ groups }), {
			wrapper: withClient(client)
		})

		await act(async () => {
			result.current.onDragEnd(dragEnd('SUP-2', 'todo', 'done'))
		})

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
		const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
		expect(body).toEqual({ state: 'done', team_id: null })
	})

	it('is a no-op when dropping on the source column', async () => {
		const groups = groupsFor(['SUP-1'], [])
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		client.setQueryData(queryKeys.launchQueue.all, snapshot(groups))

		const { result } = renderHook(() => useIssueKanbanDnd({ groups }), {
			wrapper: withClient(client)
		})

		await act(async () => {
			result.current.onDragEnd(dragEnd('SUP-1', 'todo', 'todo'))
		})

		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('shows an explainer toast and does not PATCH when dropping on needs_human', async () => {
		const groups = groupsFor(['SUP-1'], [])
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		client.setQueryData(queryKeys.launchQueue.all, snapshot(groups))

		const { result } = renderHook(() => useIssueKanbanDnd({ groups }), {
			wrapper: withClient(client)
		})

		await act(async () => {
			result.current.onDragEnd(dragEnd('SUP-1', 'todo', 'needs_human'))
		})

		expect(fetchMock).not.toHaveBeenCalled()
		expect(toastMocks.info).toHaveBeenCalledTimes(1)
		expect(toastMocks.info.mock.calls[0][0]).toBe('Column is read-only')
	})

	it('shows an explainer toast and does not PATCH when dropping on in_review', async () => {
		const groups = groupsFor(['SUP-1'], [])
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		client.setQueryData(queryKeys.launchQueue.all, snapshot(groups))

		const { result } = renderHook(() => useIssueKanbanDnd({ groups }), {
			wrapper: withClient(client)
		})

		await act(async () => {
			result.current.onDragEnd(dragEnd('SUP-1', 'todo', 'in_review'))
		})

		expect(fetchMock).not.toHaveBeenCalled()
		expect(toastMocks.info).toHaveBeenCalledTimes(1)
	})

	it('clears the active drag id when the drag is cancelled', () => {
		const groups = groupsFor(['SUP-1'], [])
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		client.setQueryData(queryKeys.launchQueue.all, snapshot(groups))

		const { result } = renderHook(() => useIssueKanbanDnd({ groups }), {
			wrapper: withClient(client)
		})

		act(() => {
			result.current.onDragStart({
				active: { id: 'SUP-1', data: { current: { fromState: 'todo' } } }
			} as never)
		})
		expect(result.current.activeIdentifier).toBe('SUP-1')

		act(() => {
			result.current.onDragCancel({
				active: { id: 'SUP-1', data: { current: { fromState: 'todo' } } }
			} as never)
		})
		expect(result.current.activeIdentifier).toBeNull()
	})

	it('surfaces a toast error and rolls back the snapshot on mutation failure', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: 'linear is down' }), { status: 503 })
		)
		const groups = groupsFor(['SUP-1'], [])
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		client.setQueryData(queryKeys.launchQueue.all, snapshot(groups))

		const { result } = renderHook(() => useIssueKanbanDnd({ groups }), {
			wrapper: withClient(client)
		})

		await act(async () => {
			result.current.onDragEnd(dragEnd('SUP-1', 'todo', 'done'))
		})

		await waitFor(() => expect(toastMocks.error).toHaveBeenCalled())

		const snap = client.getQueryData<LaunchQueueResponse>(queryKeys.launchQueue.all)
		expect(snap?.groups.todo).toHaveLength(1)
		expect(snap?.groups.done).toHaveLength(0)
	})
})
