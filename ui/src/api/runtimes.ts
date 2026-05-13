import type { AttachPayload, RuntimesResponse } from '@/types'

import { BASE, throwGenericApiError } from './_shared'

export async function fetchRuntimes(): Promise<RuntimesResponse> {
	const res = await fetch(`${BASE}/runtimes`)
	if (!res.ok) throw new Error(`GET /runtimes failed: ${res.status}`)
	return res.json()
}

export async function refreshRuntimes(): Promise<RuntimesResponse> {
	const res = await fetch(`${BASE}/runtimes/refresh`, { method: 'POST' })
	if (!res.ok) await throwGenericApiError(res, 'refresh runtimes failed')
	return res.json()
}

export async function prepareSessionAttach(runId: string, sessionId: string): Promise<AttachPayload> {
	const res = await fetch(`${BASE}/runs/${runId}/sessions/${sessionId}/attach`, {
		method: 'POST'
	})
	if (!res.ok) await throwGenericApiError(res, 'prepare attach failed')
	return res.json()
}
