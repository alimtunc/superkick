import type { DispatchFromQueueRequest, LaunchQueueResponse, Run } from '@/types'

import { getJson, postJsonChecked } from './_shared'

export async function fetchLaunchQueue(): Promise<LaunchQueueResponse> {
	return getJson(`/launch-queue`, 'fetch failed: GET /launch-queue')
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
