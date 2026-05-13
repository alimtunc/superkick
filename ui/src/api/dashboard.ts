import type { DashboardQueueResponse } from '@/types'

import { BASE } from './_shared'

export async function fetchDashboardQueue(): Promise<DashboardQueueResponse> {
	const res = await fetch(`${BASE}/dashboard/queue`)
	if (!res.ok) throw new Error(`GET /dashboard/queue failed: ${res.status}`)
	return res.json()
}
