import { issueDetailQuery } from '@/lib/queries'
import { useQuery } from '@tanstack/react-query'

export function useIssueDetail(id: string | undefined) {
	const { data, isLoading, error, dataUpdatedAt, refetch } = useQuery({
		...issueDetailQuery(id ?? ''),
		enabled: !!id
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
