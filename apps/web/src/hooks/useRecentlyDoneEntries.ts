import { useMemo } from 'react'

import { useLaunchQueue } from '@/hooks/useLaunchQueue'
import { useNow } from '@/hooks/useNow'
import { deriveRecentlyDone } from '@/lib/inbox/recentlyDone'
import type { RecentlyDoneEntry } from '@/types'

interface RecentlyDoneEntriesResult {
	entries: RecentlyDoneEntry[]
	loading: boolean
	error: string | null
	/** Stable reference time so child rows can format relative timestamps without each calling Date.now(). */
	refTime: number
}

export function useRecentlyDoneEntries(): RecentlyDoneEntriesResult {
	const launchQueue = useLaunchQueue()
	const refTime = useNow()

	const entries = useMemo(() => {
		const all = [...(launchQueue.groups['done'] ?? []), ...(launchQueue.groups['in-pr'] ?? [])]
		return deriveRecentlyDone({ launchItems: all, now: refTime })
	}, [launchQueue.groups, refTime])

	return {
		entries,
		loading: launchQueue.loading,
		error: launchQueue.error,
		refTime
	}
}
