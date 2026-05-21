import type { IssueDetailResponse, IssueListResponse, IssueStateMutable } from '@/types'

import { BASE, throwGenericApiError } from './_shared'

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
	const res = await fetch(`${BASE}/issues/${id}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ state, team_id: teamId })
	})
	if (!res.ok) await throwGenericApiError(res, `PATCH /issues/${id} failed`)
}
