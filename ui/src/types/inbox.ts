import type { LaunchQueueItem, QueueRunSummary, Run } from '@/types'

export type NeedsHumanReasonKind =
	| 'awaiting_approval'
	| 'attention_pending'
	| 'interrupt_pending'
	| 'budget_paused'
	| 'recently_failed'
	| 'stalled'

export interface NeedsHumanItem {
	/** Stable id used for React keys + dedup. Run id when available, else issue id. */
	id: string
	/** Sort order: lower = higher priority. */
	priority: number
	reasonKind: NeedsHumanReasonKind
	reason: string
	source:
		| { kind: 'launch-issue'; item: Extract<LaunchQueueItem, { kind: 'issue' }> }
		| { kind: 'queue-run'; run: QueueRunSummary }
		| { kind: 'run'; run: Run }
}

export interface RecentlyDoneEntry {
	/** Stable React key. */
	id: string
	/** Sort timestamp in ms (recency, descending). */
	timestamp: number
	item: LaunchQueueItem
}
