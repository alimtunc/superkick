import { useMemo } from 'react'

import { listConversationsByIssue, listConversationsByRun } from '@/api'
import { subjectKey } from '@/lib/conversations'
import { queryKeys } from '@/lib/queryKeys'
import type { ConversationSubject, ConversationSummary } from '@/types'
import { useQuery } from '@tanstack/react-query'

export interface UseConversationsListResult {
	conversations: ConversationSummary[]
	loading: boolean
	error: string | null
	refetch: () => void
}

function recencyTs(c: ConversationSummary): number {
	const stamp = c.last_turn_at ?? c.updated_at ?? c.created_at
	const t = Date.parse(stamp)
	return Number.isNaN(t) ? 0 : t
}

/**
 * Lists every conversation attached to a chat subject (issue or run) and
 * sorts them by most recent activity. The server returns ASC by created_at;
 * the sidebar wants newest-first so we sort here rather than in storage to
 * keep the list endpoint stable for other consumers.
 */
export function useConversationsList(subject: ConversationSubject): UseConversationsListResult {
	const key = subjectKey(subject)

	const query = useQuery({
		queryKey: queryKeys.conversations.list(key),
		queryFn: () =>
			subject.kind === 'issue'
				? listConversationsByIssue(subject.identifier)
				: listConversationsByRun(subject.run_id),
		staleTime: 5_000
	})

	const sorted = useMemo(() => {
		const list = query.data ?? []
		return list.toSorted((a, b) => recencyTs(b) - recencyTs(a))
	}, [query.data])

	return {
		conversations: sorted,
		loading: query.isLoading,
		error: query.error ? String(query.error) : null,
		refetch: () => {
			query.refetch()
		}
	}
}
