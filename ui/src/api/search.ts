import type { SearchParams, SearchResponse } from '@/types'

import { BASE, throwGenericApiError } from './_shared'

export async function fetchSearch(params: SearchParams): Promise<SearchResponse> {
	const url = new URL(`${BASE}/search`, window.location.origin)
	url.searchParams.set('q', params.q)
	url.searchParams.set('scope', params.scope)
	url.searchParams.set('includeDone', String(params.includeDone))
	if (params.limit) url.searchParams.set('limit', String(params.limit))
	const res = await fetch(url.toString().replace(window.location.origin, ''))
	if (!res.ok) await throwGenericApiError(res, 'GET /search failed')
	return res.json()
}

export async function refreshSearchFiles(): Promise<{ indexed: number }> {
	const res = await fetch(`${BASE}/search/files/refresh`, { method: 'POST' })
	if (!res.ok) await throwGenericApiError(res, 'POST /search/files/refresh failed')
	return res.json()
}
