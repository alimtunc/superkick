import type { OperatorQueue, QueueRunSummary, RunGroups } from '@/types'

const RECENT_CAP = 20

/**
 * Collapse the 6 server-side operator queues into the 4 user-facing groups
 * surfaced on `/runs` and the Inbox summary. Both surfaces read this helper so
 * counts and ordering stay in lockstep.
 *
 * Mapping:
 *   - active      = waiting + active           (in flight, no operator signal)
 *   - needsHuman  = needs-human + blocked-by-dependency
 *   - inReview    = in-pr
 *   - recent      = done (capped at the 20 most recent completed runs)
 *
 * Per `superkick-core::queue`, only `Completed` runs land in `Done`; `Failed`
 * lives in `NeedsHuman` and `Cancelled` drops off the queue entirely. So
 * `recent` is "last 20 completed runs", not "last 20 terminal runs".
 */
export function toRunGroups(groups: Record<OperatorQueue, QueueRunSummary[]>): RunGroups {
	const recent = [...(groups.done ?? [])]
		.toSorted((a, b) => terminalSortKey(b) - terminalSortKey(a))
		.slice(0, RECENT_CAP)

	return {
		active: [...(groups.waiting ?? []), ...(groups.active ?? [])],
		needsHuman: [...(groups['needs-human'] ?? []), ...(groups['blocked-by-dependency'] ?? [])],
		inReview: [...(groups['in-pr'] ?? [])],
		recent
	}
}

function terminalSortKey(run: QueueRunSummary): number {
	const finished = run.finished_at ? new Date(run.finished_at).getTime() : 0
	if (finished > 0) return finished
	return new Date(run.updated_at).getTime()
}
