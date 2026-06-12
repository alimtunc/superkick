import type {
	CreateRunRequest,
	CreateDiffReviewCommentRequest,
	CreateDiffReviewThreadRequest,
	DiffReviewComment,
	DiffReviewFileState,
	DiffReviewState,
	DiffReviewThread,
	FixRunReviewWithAiResponse,
	PatchDiffReviewThreadRequest,
	Run,
	RunDetailResponse,
	RunDiffResponse,
	RunDiffResult,
	RunEvent,
	SetDiffReviewFileReviewedRequest,
	ShipRunRequest,
	ShipRunResponse
} from '@/types'

import { BASE, deleteVoid, getJson, patchJson, postJson, postJsonChecked } from './_shared'

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

export async function fetchRunReview(id: string): Promise<DiffReviewState> {
	return getJson(`/runs/${id}/review`, 'fetch run review failed')
}

export async function createRunReviewThread(
	id: string,
	body: CreateDiffReviewThreadRequest
): Promise<DiffReviewThread> {
	return postJson(`/runs/${id}/review/threads`, 'create review thread failed', body)
}

export async function createRunReviewComment(
	id: string,
	threadId: string,
	body: CreateDiffReviewCommentRequest
): Promise<DiffReviewComment> {
	return postJson(`/runs/${id}/review/threads/${threadId}/comments`, 'create review comment failed', body)
}

export async function patchRunReviewThread(
	id: string,
	threadId: string,
	body: PatchDiffReviewThreadRequest
): Promise<DiffReviewThread> {
	return patchJson(`/runs/${id}/review/threads/${threadId}`, 'update review thread failed', body)
}

export async function deleteRunReviewThread(id: string, threadId: string): Promise<void> {
	await deleteVoid(`/runs/${id}/review/threads/${threadId}`, 'delete review thread failed')
}

export async function setRunReviewFileReviewed(
	id: string,
	body: SetDiffReviewFileReviewedRequest
): Promise<DiffReviewFileState> {
	return postJson(`/runs/${id}/review/files/reviewed`, 'set file reviewed failed', body)
}

export async function fixRunReviewWithAi(id: string): Promise<FixRunReviewWithAiResponse> {
	return postJsonChecked(`/runs/${id}/review/fix-with-ai`, 'fix review with ai failed')
}
