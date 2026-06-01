import type { IssueWorkspaceContext, MemoryEntriesPage } from '@/types'

import { getJson } from './_shared'

const DEFAULT_MEMORY_LIMIT = 50

export async function fetchIssueWorkspaceContext(issueId: string): Promise<IssueWorkspaceContext> {
	return getJson(`/issues/${encodeURIComponent(issueId)}/context`, 'Failed to load workspace context')
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
	return getJson(
		`/issues/${encodeURIComponent(issueId)}/context/memory?${params.toString()}`,
		'Failed to load memory entries'
	)
}
