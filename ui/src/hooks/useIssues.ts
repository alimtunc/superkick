import { useMemo } from 'react'

import { fetchIssues } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { LinearIssueListItem } from '@/types'
import { useQuery } from '@tanstack/react-query'

export interface StatusGroup {
	name: string
	color: string
	count: number
}

function groupByStatus(issues: LinearIssueListItem[]): StatusGroup[] {
	const map = new Map<string, StatusGroup>()
	for (const issue of issues) {
		const key = issue.status.name
		const existing = map.get(key)
		if (existing) {
			existing.count++
		} else {
			map.set(key, { name: key, color: issue.status.color, count: 1 })
		}
	}
	return Array.from(map.values()).toSorted((a, b) => b.count - a.count)
}

export function useIssues(limit = 50) {
	const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery({
		queryKey: queryKeys.issues.list(limit),
		queryFn: () => fetchIssues(limit),
		refetchInterval: 30_000,
		staleTime: 15_000
	})

	const issues = data?.issues ?? []
	const statusGroups = useMemo(() => groupByStatus(data?.issues ?? []), [data])

	return {
		issues,
		totalCount: data?.total_count ?? 0,
		loading: isLoading,
		error: error ? String(error) : null,
		lastRefresh: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
		refresh: refetch,
		statusGroups
	}
}

export type IssuesData = ReturnType<typeof useIssues>
