import { fetchIssueDetail } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import { useQuery } from '@tanstack/react-query'

export function useIssueDetail(id: string | undefined) {
	const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery({
		queryKey: queryKeys.issues.detail(id ?? ''),
		queryFn: () => fetchIssueDetail(id!),
		enabled: !!id,
		staleTime: 15_000
	})

	return {
		issue: data ?? null,
		loading: isLoading,
		error: error ? String(error) : null,
		lastRefresh: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
		refresh: refetch
	}
}

export type IssueDetailData = ReturnType<typeof useIssueDetail>
