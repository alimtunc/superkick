import type { ServerConfigResponse } from '@/types'

import { BASE } from './_shared'

export async function fetchConfig(): Promise<ServerConfigResponse> {
	const res = await fetch(`${BASE}/config`)
	if (!res.ok) throw new Error(`GET /config failed: ${res.status}`)
	return res.json()
}
