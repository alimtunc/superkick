import { fetchConfig } from '@/api'
import { toErrorMessage } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import { useQuery } from '@tanstack/react-query'

export function useConfig() {
	const { data, isLoading, error } = useQuery({
		queryKey: queryKeys.config.all,
		queryFn: fetchConfig,
		staleTime: 5 * 60_000
	})

	return {
		config: data ?? null,
		loading: isLoading,
		error: toErrorMessage(error)
	}
}
