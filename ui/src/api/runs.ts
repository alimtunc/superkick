import type {
	CreateRunRequest,
	Run,
	RunDetailResponse,
	RunDiffResponse,
	RunDiffResult,
	RunEvent,
	ShipRunRequest,
	ShipRunResponse
} from '@/types'

import { BASE, getJson, postJson, postJsonChecked } from './_shared'

export async function createRun(req: CreateRunRequest): Promise<Run> {
	return postJsonChecked('/runs', 'create run failed', req)
}

export async function fetchRuns(): Promise<Run[]> {
	return getJson('/runs', 'fetch runs failed')
}

export async function fetchRun(id: string): Promise<RunDetailResponse> {
	return getJson(`/runs/${id}`, 'fetch run failed')
}

export async function fetchRunEvents(id: string): Promise<RunEvent[]> {
	return getJson(`/runs/${id}/events/log`, 'fetch run events failed')
}

export async function cancelRun(id: string): Promise<Run> {
	return postJson(`/runs/${id}/cancel`, 'cancel run failed')
}

/** Operator-triggered ship: push the branch and (for draft/ready) open a PR.
 *  Surfaces the backend's 422 message verbatim (gh not authed, nothing to ship…). */
export async function shipRun(id: string, body: ShipRunRequest): Promise<ShipRunResponse> {
	return postJson(`/runs/${id}/ship`, 'ship failed', body)
}

export async function fetchRunDiff(id: string): Promise<RunDiffResult> {
	const res = await fetch(`${BASE}/runs/${id}/diff`)
	if (res.status === 404) return { kind: 'unavailable', reason: 'no_worktree' }
	if (res.status === 422) return { kind: 'unavailable', reason: 'not_worktree_backed' }
	if (!res.ok) throw new Error(`GET /runs/${id}/diff failed: ${res.status}`)
	return { kind: 'ok', value: (await res.json()) as RunDiffResponse }
}
