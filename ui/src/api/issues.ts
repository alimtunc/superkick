import type { IssueDetailResponse, IssueListResponse } from '@/types'

import { BASE } from './_shared'

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
