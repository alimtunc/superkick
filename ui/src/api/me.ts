import type { ViewerResponse } from '@/types'

import { BASE } from './_shared'

export async function fetchMe(): Promise<ViewerResponse> {
	const res = await fetch(`${BASE}/me`)
	if (!res.ok) throw new Error(`GET /me failed: ${res.status}`)
	return res.json()
}
