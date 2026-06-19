import type { AgentProvider, ModelInfo } from '@/types'

import { getJson } from './_shared'

export async function getProviderModels(provider: AgentProvider): Promise<ModelInfo[]> {
	return getJson(`/providers/${provider}/models`, 'list provider models failed')
}
