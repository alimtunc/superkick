import type { ProviderSettings } from '@/types'

import { getJson, patchJson } from './_shared'

export async function fetchProviderSettings(): Promise<ProviderSettings[]> {
	return getJson('/provider-settings', 'fetch provider settings failed')
}

export async function patchProviderSettings(
	provider: string,
	settings: ProviderSettings
): Promise<ProviderSettings> {
	return patchJson(`/provider-settings/${provider}`, 'update provider settings failed', settings)
}
