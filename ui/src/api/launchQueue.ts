import type { DispatchFromQueueRequest, LaunchQueueResponse, Run } from '@/types'

import { BASE, postJsonChecked } from './_shared'

export async function fetchLaunchQueue(): Promise<LaunchQueueResponse> {
	const res = await fetch(`${BASE}/launch-queue`)
	if (!res.ok) throw new Error(`GET /launch-queue failed: ${res.status}`)
	return res.json()
}

export async function dispatchFromQueue(
	issueIdentifier: string,
	req: DispatchFromQueueRequest = {}
): Promise<Run> {
	return postJsonChecked(
		`/launch-queue/${encodeURIComponent(issueIdentifier)}/dispatch`,
		'dispatch from queue failed',
		req
	)
}
