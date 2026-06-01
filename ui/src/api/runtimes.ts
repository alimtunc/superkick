import type { AttachPayload, RuntimesResponse } from '@/types'

import { BASE, postJson } from './_shared'

export async function fetchRuntimes(): Promise<RuntimesResponse> {
	const res = await fetch(`${BASE}/runtimes`)
	if (!res.ok) throw new Error(`GET /runtimes failed: ${res.status}`)
	return res.json()
}

export async function refreshRuntimes(): Promise<RuntimesResponse> {
	return postJson('/runtimes/refresh', 'refresh runtimes failed')
}

export async function prepareSessionAttach(runId: string, sessionId: string): Promise<AttachPayload> {
	return postJson(`/runs/${runId}/sessions/${sessionId}/attach`, 'prepare attach failed')
}
