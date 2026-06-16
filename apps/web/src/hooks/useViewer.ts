import { fetchMe } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { ViewerResponse } from '@/types'
import { useQuery } from '@tanstack/react-query'

export interface UseViewerResult {
	viewerId: string | null
	viewer: ViewerResponse | null
	loading: boolean
}

/**
 * Resolve the authenticated Linear viewer. Used by `useIssuesView` to decide
 * which rows are "assigned to me" without name-match heuristics.
 *
 * `viewerId` is `null` while loading, when the request fails, or when Linear
 * isn't connected. Callers degrade gracefully (e.g. fall back to the
 * `All open` tab) instead of erroring.
 */
export function useViewer(): UseViewerResult {
	const { data, isLoading } = useQuery({
		queryKey: queryKeys.me.all,
		queryFn: fetchMe,
		staleTime: 5 * 60_000,
		retry: false
	})

	return {
		viewerId: data?.id ?? null,
		viewer: data ?? null,
		loading: isLoading
	}
}
