import type { ServerConfigResponse } from '@/types'

import { getJson } from './_shared'

export async function fetchConfig(): Promise<ServerConfigResponse> {
	return getJson(`/config`, 'fetch failed: GET /config')
}
