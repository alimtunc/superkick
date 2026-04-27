import { useMemo } from 'react'

import { useDashboardRuns } from '@/hooks/useDashboardRuns'
import { useLaunchQueue } from '@/hooks/useLaunchQueue'
import { useOperatorQueue } from '@/hooks/useOperatorQueue'
import { combineErrors } from '@/lib/inbox/errors'
import { deriveNeedsHuman } from '@/lib/inbox/needsHuman'
import type { NeedsHumanItem } from '@/types'

interface NeedsHumanItemsResult {
	items: NeedsHumanItem[]
	loading: boolean
	error: string | null
	linearWarning: string | null
	refresh: () => void
}

/**
 * Compose the "Needs Human" Inbox section data: aggregates three independent
 * queries (operator queue, dashboard runs, launch queue), runs `deriveNeedsHuman`,
 * and exposes a single `refresh` for the section's retry button. Linear errors
 * surface separately as `linearWarning` so the section can show a banner without
 * blanking the panel.
 */
export function useNeedsHumanItems(): NeedsHumanItemsResult {
	const launchQueue = useLaunchQueue()
	const queue = useOperatorQueue()
	const dashboard = useDashboardRuns()

	const items = useMemo(() => {
		const launchItems = [
			...(launchQueue.groups['needs-human'] ?? []),
			...(launchQueue.groups['active'] ?? [])
		]
		return deriveNeedsHuman({
			launchItems,
			queueRuns: queue.groups['active'] ?? [],
			runs: dashboard.runs,
			now: Date.now()
		})
	}, [launchQueue.groups, queue.groups, dashboard.runs])

	return {
		items,
		loading: queue.loading || dashboard.loading,
		error: combineErrors(queue.error, dashboard.error),
		linearWarning: launchQueue.error,
		refresh: () => {
			queue.refresh()
			dashboard.refresh()
		}
	}
}
