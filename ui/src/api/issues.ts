import type {
	IssueComment,
	IssueCreateRequest,
	IssueDetailResponse,
	IssueListResponse,
	IssueStateMutable,
	IssueUpdateRequest
} from '@/types'

import { BASE, patchVoid, throwLinearError } from './_shared'

export async function fetchIssues(limit = 200): Promise<IssueListResponse> {
	const res = await fetch(`${BASE}/issues?limit=${limit}`)
	if (!res.ok) throw new Error(`GET /issues failed: ${res.status}`)
	return res.json()
}

export async function fetchIssueDetail(id: string): Promise<IssueDetailResponse> {
	const res = await fetch(`${BASE}/issues/${id}`)
	if (!res.ok) throw new Error(`GET /issues/${id} failed: ${res.status}`)
	return res.json()
}

/** Persist a Linear status change. `teamId`, when known, lets the server skip a team-lookup round-trip. */
export async function patchIssueState(
	id: string,
	state: IssueStateMutable,
	teamId: string | null
): Promise<void> {
	await patchVoid(`/issues/${id}`, `PATCH /issues/${id} failed`, { state, team_id: teamId })
}

/** Create a Linear issue. Returns the fully hydrated detail so the caller can navigate without a follow-up GET. */
export async function createIssue(body: IssueCreateRequest): Promise<IssueDetailResponse> {
	const res = await fetch(`${BASE}/issues`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	})
	if (!res.ok) await throwLinearError(res, 'POST /issues failed')
	return res.json()
}

/** `undefined` = no change (dropped by JSON.stringify), `null` = clear on Linear; response is the hydrated detail. */
export async function patchIssue(id: string, patch: IssueUpdateRequest): Promise<IssueDetailResponse> {
	const res = await fetch(`${BASE}/issues/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(patch)
	})
	if (!res.ok) await throwLinearError(res, `PATCH /issues/${id} failed`)
	return res.json()
}

export async function createIssueComment(issueId: string, body: string): Promise<IssueComment> {
	const res = await fetch(`${BASE}/issues/${issueId}/comments`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ body })
	})
	if (!res.ok) await throwLinearError(res, `POST /issues/${issueId}/comments failed`)
	return res.json()
}
