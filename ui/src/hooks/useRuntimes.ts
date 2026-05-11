import { refreshRuntimes } from '@/api'
import { toErrorMessage } from '@/lib/errors'
import { runtimesQuery } from '@/lib/queries'
import { queryKeys } from '@/lib/queryKeys'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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
		error: toErrorMessage(query.error),
		refresh: refresh.mutate,
		isRefreshing: refresh.isPending,
		refreshError: toErrorMessage(refresh.error)
	}
}
