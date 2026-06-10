import type { AttachPayload, RuntimesResponse } from '@/types'

import { getJson, postJson } from './_shared'

export async function fetchRuntimes(): Promise<RuntimesResponse> {
	return getJson(`/runtimes`, 'fetch failed: GET /runtimes')
}

export async function refreshRuntimes(): Promise<RuntimesResponse> {
	return postJson('/runtimes/refresh', 'refresh runtimes failed')
}

export async function prepareSessionAttach(runId: string, sessionId: string): Promise<AttachPayload> {
	return postJson(`/runs/${runId}/sessions/${sessionId}/attach`, 'prepare attach failed')
}
