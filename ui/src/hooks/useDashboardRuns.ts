import { useMemo } from 'react'

import { fetchRuns } from '@/api'
import { useNow } from '@/hooks/useNow'
import { AGING_THRESHOLD_MS } from '@/lib/constants'
import { classifyRuns, elapsedMs, fmtElapsed } from '@/lib/domain'
import { toErrorMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import { useQuery } from '@tanstack/react-query'

export function useDashboardRuns() {
	const {
		data: runs = [],
		isLoading: loading,
		error: queryError,
		dataUpdatedAt,
		refetch
	} = useQuery({
		queryKey: queryKeys.runs.all,
		queryFn: fetchRuns,
		refetchInterval: 15_000
	})

	const error = toErrorMessage(queryError)
	const refTime = useNow()
	const lastRefresh = useMemo(() => new Date(dataUpdatedAt || Date.now()), [dataUpdatedAt])
	const classified = useMemo(() => classifyRuns(runs), [runs])

	const successRate =
		classified.terminal.length > 0
			? Math.round((classified.completed.length / classified.terminal.length) * 100)
			: null

	const aging = useMemo(
		() =>
			classified.active.filter(
				(r) =>
					elapsedMs(r.started_at, refTime) > AGING_THRESHOLD_MS &&
					r.state !== 'waiting_human' &&
					r.state !== 'failed'
			),
		[classified.active, refTime]
	)

	const oldestActive = useMemo(() => {
		if (classified.active.length === 0) return '--'
		const oldest = classified.active.reduce((a, b) =>
			new Date(a.started_at).getTime() < new Date(b.started_at).getTime() ? a : b
		)
		return fmtElapsed(oldest.started_at, refTime)
	}, [classified.active, refTime])

	return {
		runs,
		loading,
		error,
		lastRefresh,
		refTime,
		refresh: refetch,
		...classified,
		successRate,
		aging,
		oldestActive
	}
}

export type DashboardData = ReturnType<typeof useDashboardRuns>
