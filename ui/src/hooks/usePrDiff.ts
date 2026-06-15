import { fetchPrDiff } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import { useQuery } from '@tanstack/react-query'

/** The PR diff, shared by the review rail (Files changed) and the Diff tab. */
export function usePrDiff(number: number, enabled = true) {
	return useQuery({
		queryKey: queryKeys.reviews.diff(number),
		queryFn: () => fetchPrDiff(number),
		staleTime: 15_000,
		enabled
	})
}
