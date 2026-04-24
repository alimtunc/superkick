import { useEffect, useState } from 'react'

import { UNBLOCK_BADGE_WINDOW_MS } from '@/lib/domain'
import { toErrorMessage } from '@/lib/errors'
import { workspaceEventBroker } from '@/lib/eventBroker'
import { launchQueueQuery } from '@/lib/queries'
import { queryKeys } from '@/lib/queryKeys'
import type { LaunchQueue, LaunchQueueItem, RecentUnblocks } from '@/types'
import { LAUNCH_QUEUES } from '@/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'

const EMPTY_GROUPS: Record<LaunchQueue, LaunchQueueItem[]> = LAUNCH_QUEUES.reduce(
	(acc, queue) => {
		acc[queue] = []
		return acc
	},
	{} as Record<LaunchQueue, LaunchQueueItem[]>
)

/**
 * Launch queue snapshot + live refresh on `state_change` events and
 * `dependency_resolved` issue events (SUP-81). The classifier is pure — it
 * recomputes the queue from (issues, runs, config) on every GET — so we just
 * invalidate the query and let the server re-derive, instead of duplicating
 * the bucketing rules client-side.
 *
 * The `recentUnblocks` map tracks downstream issues whose blocker resolved in
 * the current session; consumers show an "unblocked" badge for 24 h (see
 * `UNBLOCK_BADGE_WINDOW_MS`). Session-local on purpose: the event feed is the
 * authoritative audit source; no additional storage is required.
 */
export function useLaunchQueue() {
	const query = useQuery(launchQueueQuery())
	const queryClient = useQueryClient()
	const [recentUnblocks, setRecentUnblocks] = useState<RecentUnblocks>({})

	useEffect(() => {
		workspaceEventBroker.start()
		const unsubscribeRun = workspaceEventBroker.subscribe({ variant: 'run_event' }, (notice) => {
			if (notice.type !== 'run_event') return
			if (notice.kind === 'state_change') {
				queryClient.invalidateQueries({ queryKey: queryKeys.launchQueue.all })
			}
		})
		const unsubscribeIssue = workspaceEventBroker.subscribe({ variant: 'issue_event' }, (notice) => {
			if (notice.type !== 'issue_event') return
			if (notice.kind === 'dependency_resolved') {
				setRecentUnblocks((prev) =>
					pruneAndInsert(prev, notice.downstream_issue_id, notice.resolved_at)
				)
				queryClient.invalidateQueries({ queryKey: queryKeys.launchQueue.all })
			}
		})
		return () => {
			unsubscribeRun()
			unsubscribeIssue()
		}
	}, [queryClient])

	return {
		loading: query.isLoading,
		error: toErrorMessage(query.error),
		generatedAt: query.data?.generated_at ?? null,
		activeCapacity: query.data?.active_capacity ?? { current: 0, max: 0 },
		groups: query.data?.groups ?? EMPTY_GROUPS,
		recentUnblocks
	}
}

/** Add `id -> resolvedAt` and drop any prior entry older than the badge
 *  window, so the session-local map cannot grow unbounded across a multi-day
 *  session. */
function pruneAndInsert(prev: RecentUnblocks, id: string, resolvedAt: string): RecentUnblocks {
	const cutoff = Date.now() - UNBLOCK_BADGE_WINDOW_MS
	const next: RecentUnblocks = {}
	for (const [key, ts] of Object.entries(prev)) {
		const parsed = Date.parse(ts)
		if (!Number.isNaN(parsed) && parsed >= cutoff) {
			next[key] = ts
		}
	}
	next[id] = resolvedAt
	return next
}

export type LaunchQueueData = ReturnType<typeof useLaunchQueue>
