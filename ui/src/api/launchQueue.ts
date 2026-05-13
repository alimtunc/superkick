import type { DispatchFromQueueRequest, LaunchQueueResponse, Run } from '@/types'

import { BASE, throwApiError } from './_shared'

export async function fetchLaunchQueue(): Promise<LaunchQueueResponse> {
	const res = await fetch(`${BASE}/launch-queue`)
	if (!res.ok) throw new Error(`GET /launch-queue failed: ${res.status}`)
	return res.json()
}

export async function dispatchFromQueue(
	issueIdentifier: string,
	req: DispatchFromQueueRequest = {}
): Promise<Run> {
	const res = await fetch(`${BASE}/launch-queue/${encodeURIComponent(issueIdentifier)}/dispatch`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	})
	if (!res.ok) await throwApiError(res, 'dispatch from queue failed')
	return res.json()
}
