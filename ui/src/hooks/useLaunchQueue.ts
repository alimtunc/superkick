import { useEffect } from 'react'

import { toErrorMessage } from '@/lib/errors'
import { workspaceEventBroker } from '@/lib/eventBroker'
import { launchQueueQuery } from '@/lib/queries'
import { queryKeys } from '@/lib/queryKeys'
import type { LaunchQueue, LaunchQueueItem } from '@/types'
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
 * Launch queue snapshot + live refresh on any `state_change` event.
 *
 * The SUP-80 classifier is pure — it recomputes the whole queue from
 * (issues, runs, config) on every GET. So instead of mutating the cache in
 * place on each event (which would require duplicating the bucketing rules
 * client-side), we just invalidate the query and let the server re-derive.
 * That keeps the UI and the classifier in lockstep by construction.
 */
export function useLaunchQueue() {
	const query = useQuery(launchQueueQuery())
	const queryClient = useQueryClient()

	useEffect(() => {
		workspaceEventBroker.start()
		const unsubscribe = workspaceEventBroker.subscribe({ variant: 'run_event' }, (notice) => {
			if (notice.type !== 'run_event') return
			if (notice.kind === 'state_change') {
				queryClient.invalidateQueries({ queryKey: queryKeys.launchQueue.all })
			}
		})
		return unsubscribe
	}, [queryClient])

	return {
		loading: query.isLoading,
		error: toErrorMessage(query.error),
		generatedAt: query.data?.generated_at ?? null,
		activeCapacity: query.data?.active_capacity ?? { current: 0, max: 0 },
		groups: query.data?.groups ?? EMPTY_GROUPS
	}
}

export type LaunchQueueData = ReturnType<typeof useLaunchQueue>
