import type { LaunchQueueItem, RecentlyDoneEntry } from '@/types'

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_ENTRIES = 5

interface DeriveInputs {
	launchItems: readonly LaunchQueueItem[]
	now: number
	maxEntries?: number
}

/**
 * Filter `done` + `in-pr` launch-queue items to the ones that touched the
 * timeline in the last 24 h, sort newest-first, cap at 5 by default. The
 * timestamp source differs per kind: `run.finished_at` (or `started_at`
 * fallback) for run cards, `issue.updated_at` for issue cards — both are
 * the closest "last meaningful event" we have without a backend change.
 */
export function deriveRecentlyDone({
	launchItems,
	now,
	maxEntries = MAX_ENTRIES
}: DeriveInputs): RecentlyDoneEntry[] {
	const cutoff = now - RECENT_WINDOW_MS
	const entries: RecentlyDoneEntry[] = []

	for (const item of launchItems) {
		if (item.bucket !== 'done' && item.bucket !== 'in-pr') continue
		const ts = entryTimestamp(item)
		if (ts == null || ts < cutoff) continue
		entries.push({ id: entryId(item), timestamp: ts, item })
	}

	entries.sort((a, b) => b.timestamp - a.timestamp)
	return entries.slice(0, maxEntries)
}

function entryTimestamp(item: LaunchQueueItem): number | null {
	if (item.kind === 'run') {
		const candidate = item.run.finished_at ?? item.run.updated_at ?? item.run.started_at
		const ts = Date.parse(candidate)
		if (Number.isNaN(ts)) {
			console.warn('[recentlyDone] unparseable run timestamp', { runId: item.run.id, candidate })
			return null
		}
		return ts
	}
	const ts = Date.parse(item.issue.updated_at)
	if (Number.isNaN(ts)) {
		console.warn('[recentlyDone] unparseable issue timestamp', {
			issueId: item.issue.id,
			updated_at: item.issue.updated_at
		})
		return null
	}
	return ts
}

function entryId(item: LaunchQueueItem): string {
	return item.kind === 'run' ? `run:${item.run.id}` : `issue:${item.issue.id}`
}
