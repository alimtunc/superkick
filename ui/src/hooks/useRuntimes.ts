import { refreshRuntimes } from '@/api'
import { runtimesQuery } from '@/lib/queries'
import { queryKeys } from '@/lib/queryKeys'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : 'Unknown error'
}

export function useRuntimes() {
	const query = useQuery(runtimesQuery())
	const queryClient = useQueryClient()

	const refresh = useMutation({
		mutationFn: refreshRuntimes,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.runtimes.all })
		}
	})

	return {
		data: query.data ?? null,
		isLoading: query.isLoading,
		error: query.error !== null ? errorMessage(query.error) : null,
		refresh: refresh.mutate,
		isRefreshing: refresh.isPending,
		refreshError: refresh.error !== null ? errorMessage(refresh.error) : null
	}
}
