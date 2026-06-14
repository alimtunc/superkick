import type { QueueRunSummary } from './dashboard'
import type { LinearIssueListItem } from './issues'
import type { LaunchQueueItem } from './launchQueue'
import type { Run } from './runs'

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

export type InboxActionVerb = 'answer' | 'approve' | 'review' | 'resume' | 'takeover' | 'launch' | 'view'

export type InboxActionDestination =
	| { kind: 'issue'; issueId: string; openChat?: boolean }
	| { kind: 'run'; runId: string; hash?: 'terminal'; openChat?: boolean }
	| { kind: 'external'; href: string }
	| { kind: 'dispatch' }

export interface InboxAction {
	verb: InboxActionVerb
	label: string
	destination: InboxActionDestination
}

export type InboxActionContext =
	| { kind: 'needs-human'; item: NeedsHumanItem }
	| { kind: 'queue-run'; run: QueueRunSummary }
	| { kind: 'recently-done'; entry: RecentlyDoneEntry }
	| { kind: 'ready-to-launch'; issue: LinearIssueListItem }
