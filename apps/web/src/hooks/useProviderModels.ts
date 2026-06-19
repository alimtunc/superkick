import { getProviderModels } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { AgentProvider, ModelInfo } from '@/types'
import { queryOptions, useQuery } from '@tanstack/react-query'

export function providerModelsQuery(provider: AgentProvider) {
	return queryOptions({
		queryKey: queryKeys.providerModels.forProvider(provider),
		queryFn: () => getProviderModels(provider),
		// Static curated catalog — only ever changes on a deploy.
		staleTime: 60 * 60_000
	})
}

interface UseProviderModels {
	models: ModelInfo[]
	isLoading: boolean
}

/** Curated per-provider model list for the editor/composer dropdown. */
export function useProviderModels(provider: AgentProvider): UseProviderModels {
	const query = useQuery(providerModelsQuery(provider))
	return { models: query.data ?? [], isLoading: query.isLoading }
}
