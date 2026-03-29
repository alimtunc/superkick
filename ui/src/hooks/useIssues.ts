import { fetchIssues } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import { useQuery } from '@tanstack/react-query'

export function useIssues(limit = 50) {
	const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery({
		queryKey: queryKeys.issues.list(limit),
		queryFn: () => fetchIssues(limit),
		refetchInterval: 30_000,
		staleTime: 15_000
	})

	return {
		issues: data?.issues ?? [],
		totalCount: data?.total_count ?? 0,
		loading: isLoading,
		error: error ? String(error) : null,
		lastRefresh: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
		refresh: refetch
	}
}

export type IssuesData = ReturnType<typeof useIssues>
