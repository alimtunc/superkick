import type {
	IssueCommentExcerpt,
	IssueDetailResponse,
	IssueLinkedItemRef,
	IssueSnapshot,
	IssueWorkspaceContext,
	MemoryEntriesPage
} from '@/types'

import { fetchIssueDetail } from './issues'

// TODO(SUP-147): swap for the aggregate `GET /api/issues/:id/context` endpoint.
export async function fetchIssueWorkspaceContext(issueId: string): Promise<IssueWorkspaceContext> {
	const detail = await fetchIssueDetail(issueId)
	return deriveContextFromDetail(detail)
}

// TODO(SUP-148): swap for the paginated `GET /api/issues/:id/context/memory` endpoint.
export async function fetchIssueMemoryEntries(
	_issueId: string,
	_cursor: string | null
): Promise<MemoryEntriesPage> {
	return { entries: [], next_cursor: null }
}

function deriveContextFromDetail(detail: IssueDetailResponse): IssueWorkspaceContext {
	const snapshot: IssueSnapshot = {
		id: detail.id,
		identifier: detail.identifier,
		title: detail.title,
		description: detail.description,
		status: detail.status,
		captured_at: detail.updated_at
	}

	const comment_excerpts: IssueCommentExcerpt[] = []

	const linked_items: IssueLinkedItemRef[] = detail.linked_runs.map((run) => ({
		kind: 'run' as const,
		id: run.id,
		label: `Run · ${run.id.slice(0, 8)}`,
		state: run.state,
		captured_at: run.started_at
	}))

	return { snapshot, comment_excerpts, linked_items }
}
