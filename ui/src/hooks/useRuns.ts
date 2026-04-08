import { useMemo } from 'react'

import { fetchRuns } from '@/api'
import { classifyRuns, type ClassifiedRuns } from '@/lib/domain'
import { queryKeys } from '@/lib/queryKeys'
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
		queryKey: queryKeys.runs.all,
		queryFn: fetchRuns,
		refetchInterval: 15_000,
		staleTime: 10_000
	})

	const loading = isLoading || isFetching
	const error = queryError ? String(queryError) : null
	const refTime = useMemo(() => dataUpdatedAt || Date.now(), [dataUpdatedAt])
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
