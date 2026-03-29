import { fetchConfig } from '@/api'
import { useQuery } from '@tanstack/react-query'

export function useConfig() {
	const { data, isLoading, error } = useQuery({
		queryKey: ['config'],
		queryFn: fetchConfig,
		staleTime: 5 * 60_000
	})

	return {
		config: data ?? null,
		loading: isLoading,
		error: error ? String(error) : null
	}
}
