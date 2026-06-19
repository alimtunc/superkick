import { useMemo } from 'react'

import { listConversationsByIssue, listConversationsByRun } from '@/api'
import { subjectKey } from '@/lib/conversations'
import { queryKeys } from '@/lib/queryKeys'
import type { ConversationSubject, ConversationSummary } from '@/types'
import { useQuery } from '@tanstack/react-query'

function recencyTs(c: ConversationSummary): number {
	const stamp = c.last_turn_at ?? c.updated_at ?? c.created_at
	const t = Date.parse(stamp)
	return Number.isNaN(t) ? 0 : t
}

export function useConversationsList(subject: ConversationSubject) {
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
