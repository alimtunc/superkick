import type { IssueWorkspaceContext, MemoryEntriesPage, MemoryEntry } from '@/types'

import { BASE, throwGenericApiError } from './_shared'

const DEFAULT_MEMORY_LIMIT = 50

export async function fetchIssueWorkspaceContext(issueId: string): Promise<IssueWorkspaceContext> {
	const res = await fetch(`${BASE}/issues/${encodeURIComponent(issueId)}/context`)
	if (!res.ok) {
		await throwGenericApiError(res, 'Failed to load workspace context')
	}
	return (await res.json()) as IssueWorkspaceContext
}

export async function fetchIssueMemoryEntries(
	issueId: string,
	cursor: string | null
): Promise<MemoryEntriesPage> {
	const params = new URLSearchParams()
	params.set('limit', String(DEFAULT_MEMORY_LIMIT))
	if (cursor !== null) {
		params.set('cursor', cursor)
	}
	const res = await fetch(
		`${BASE}/issues/${encodeURIComponent(issueId)}/context/memory?${params.toString()}`
	)
	if (!res.ok) {
		await throwGenericApiError(res, 'Failed to load memory entries')
	}
	return (await res.json()) as MemoryEntriesPage
}

export interface AppendIssueMemoryEntryInput {
	role: string
	author?: string | null
	text: string
}

/** Exposed for SUP-149 / SUP-150 callers (LaunchTask + chat). No component in
 *  this ticket calls it. */
export async function appendIssueMemoryEntry(
	issueId: string,
	body: AppendIssueMemoryEntryInput
): Promise<MemoryEntry> {
	const res = await fetch(`${BASE}/issues/${encodeURIComponent(issueId)}/context/memory`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	})
	if (!res.ok) {
		await throwGenericApiError(res, 'Failed to append memory entry')
	}
	return (await res.json()) as MemoryEntry
}
