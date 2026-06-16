import type { ViewerResponse } from '@/types'

import { getJson } from './_shared'

export async function fetchMe(): Promise<ViewerResponse> {
	return getJson(`/me`, 'fetch failed: GET /me')
}
