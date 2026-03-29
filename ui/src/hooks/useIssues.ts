import { useMemo, useState } from 'react'

import { fetchIssues } from '@/api'
import { type ClassifiedIssues, type IssueBucket, classifyIssues } from '@/lib/domain/classifyIssues'
import { queryKeys } from '@/lib/queryKeys'
import { useQuery } from '@tanstack/react-query'

const EMPTY_ISSUES: never[] = []

export function useIssues(limit = 50) {
	const [activeBucket, setActiveBucket] = useState<IssueBucket>('ready')

	const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery({
		queryKey: queryKeys.issues.list(limit),
		queryFn: () => fetchIssues(limit),
		refetchInterval: 30_000,
		staleTime: 15_000
	})

	const allIssues = data?.issues ?? EMPTY_ISSUES

	const classified: ClassifiedIssues = useMemo(() => classifyIssues(allIssues), [allIssues])

	const filteredIssues = classified[activeBucket]

	return {
		allIssues,
		filteredIssues,
		classified,
		activeBucket,
		setActiveBucket,
		totalCount: data?.total_count ?? 0,
		loading: isLoading,
		error: error ? String(error) : null,
		lastRefresh: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
		refresh: refetch
	}
}

export type IssuesData = ReturnType<typeof useIssues>
