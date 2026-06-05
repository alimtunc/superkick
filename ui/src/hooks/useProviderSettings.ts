import { patchProviderSettings } from '@/api'
import { toErrorMessage } from '@/lib/errors'
import { providerSettingsQuery } from '@/lib/queries'
import { queryKeys } from '@/lib/queryKeys'
import type { ProviderSettings } from '@/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export function useProviderSettings() {
	const query = useQuery(providerSettingsQuery())
	const queryClient = useQueryClient()

	const update = useMutation({
		mutationFn: ({ provider, settings }: { provider: string; settings: ProviderSettings }) =>
			patchProviderSettings(provider, settings),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.providerSettings.all })
		}
	})

	return {
		providers: query.data ?? [],
		isLoading: query.isLoading,
		error: toErrorMessage(query.error),
		updateProvider: update.mutateAsync,
		isUpdating: update.isPending,
		updateError: toErrorMessage(update.error)
	}
}
