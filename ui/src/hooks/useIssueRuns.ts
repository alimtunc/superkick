import { useMemo } from 'react'

import type { LinkedRunSummary } from '@/types'

const HISTORY_LIMIT = 5

export interface UseIssueRunsResult {
	total: number
	latest: LinkedRunSummary | null
	tail: LinkedRunSummary[]
	overflow: number
}

export function useIssueRuns(runs: LinkedRunSummary[]): UseIssueRunsResult {
	return useMemo(() => {
		if (runs.length === 0) {
			return { total: 0, latest: null, tail: [], overflow: 0 }
		}

		const sorted = runs.toSorted(
			(a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
		)
		const visibleCount = 1 + HISTORY_LIMIT
		return {
			total: sorted.length,
			latest: sorted[0],
			tail: sorted.slice(1, visibleCount),
			overflow: Math.max(0, sorted.length - visibleCount)
		}
	}, [runs])
}
