import { fetchLinearOptions } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { LinearOptions } from '@/types'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

/**
 * Pickers for the issue editor share one cache. 5-minute staleTime matches
 * the rate at which a Linear workspace's teams / labels / users actually
 * change; `retry: false` because a misconfigured Linear key shouldn't burn
 * three exponential backoffs before the operator sees the error toast.
 */
export function useLinearOptions(): UseQueryResult<LinearOptions, Error> {
	return useQuery({
		queryKey: queryKeys.linearOptions.all,
		queryFn: fetchLinearOptions,
		staleTime: 5 * 60_000,
		retry: false
	})
}
