import { useMemo } from 'react'

import { classifyRuns, type ClassifiedRuns } from '@/lib/domain'
import { runsQuery } from '@/lib/queries'
import type { Run } from '@/types'
import { useQuery } from '@tanstack/react-query'

export type RunFilter = 'all' | 'active' | 'completed' | 'failed' | 'cancelled'

export function useRuns() {
	const {
		data: runs = [],
		isLoading,
		isFetching,
		error: queryError,
		dataUpdatedAt,
		refetch
	} = useQuery({
		...runsQuery(),
		refetchInterval: 15_000
	})

	const loading = isLoading || isFetching
	const error = queryError ? String(queryError) : null
	const refTime = dataUpdatedAt || Date.now()
	const classified = useMemo(() => classifyRuns(runs), [runs])

	const sorted = useMemo(
		() => runs.toSorted((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()),
		[runs]
	)

	return {
		runs: sorted,
		loading,
		error,
		refTime,
		refresh: refetch,
		classified,
		total: runs.length
	}
}

export function filterRuns(runs: Run[], filter: RunFilter, classified: ClassifiedRuns): Run[] {
	switch (filter) {
		case 'all':
			return runs
		case 'active':
			return classified.active
		case 'completed':
			return classified.completed
		case 'failed':
			return classified.failed
		case 'cancelled':
			return classified.cancelled
	}
}
