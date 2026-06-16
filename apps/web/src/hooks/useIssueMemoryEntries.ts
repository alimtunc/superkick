import { useMemo } from 'react'

import { issueMemoryEntriesQuery } from '@/lib/queries'
import type { MemoryEntry } from '@/types'
import { useInfiniteQuery } from '@tanstack/react-query'

export function useIssueMemoryEntries(issueId: string | null) {
	const query = useInfiniteQuery(issueMemoryEntriesQuery(issueId))

	const entries: MemoryEntry[] = useMemo(() => {
		if (!query.data) return []
		return query.data.pages.flatMap((page) => page.entries)
	}, [query.data])

	return {
		entries,
		isLoading: query.isLoading,
		isError: query.isError,
		error: query.error,
		hasNextPage: query.hasNextPage,
		isFetchingNextPage: query.isFetchingNextPage,
		fetchNextPage: query.fetchNextPage,
		refetch: query.refetch
	}
}

export type IssueMemoryEntriesQuery = ReturnType<typeof useIssueMemoryEntries>
