import { fetchIssues } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { LinearIssueListItem } from '@/types'
import { useQuery } from '@tanstack/react-query'

const EMPTY_ISSUES: never[] = []

export function useIssuesQuery(limit = 200) {
	const { data, isLoading, isFetching, error, dataUpdatedAt, refetch } = useQuery({
		queryKey: queryKeys.issues.list(limit),
		queryFn: () => fetchIssues(limit),
		refetchInterval: 30_000,
		staleTime: 15_000
	})

	const allIssues: LinearIssueListItem[] = data?.issues ?? EMPTY_ISSUES

	return {
		allIssues,
		totalCount: data?.total_count ?? 0,
		loading: isLoading || isFetching,
		error: error ? String(error) : null,
		lastRefresh: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
		refresh: refetch
	}
}
