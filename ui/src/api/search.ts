import type { SearchParams, SearchResponse } from '@/types'

import { getJson, postJson } from './_shared'

export async function fetchSearch(params: SearchParams): Promise<SearchResponse> {
	const query = new URLSearchParams()
	query.set('q', params.q)
	query.set('scope', params.scope)
	query.set('includeDone', String(params.includeDone))
	if (params.limit) query.set('limit', String(params.limit))
	return getJson(`/search?${query.toString()}`, 'GET /search failed')
}

export async function refreshSearchFiles(): Promise<{ indexed: number }> {
	return postJson('/search/files/refresh', 'POST /search/files/refresh failed')
}
