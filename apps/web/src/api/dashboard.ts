import type { DashboardQueueResponse } from '@/types'

import { getJson } from './_shared'

export async function fetchDashboardQueue(): Promise<DashboardQueueResponse> {
	return getJson(`/dashboard/queue`, 'fetch failed: GET /dashboard/queue')
}
