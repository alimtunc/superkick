import type { LinearIssueListItem } from './issues'
import type { LinkedPrSummary } from './pr'
import type { ExecutionMode, Run } from './runs'

/**
 * Launch-queue buckets — SUP-80. Derived server-side from (Linear issues,
 * Superkick runs, orchestration config). The wire shape is deliberately a
 * kebab-case string union so the 8 columns can be rendered with `.map()`
 * over the canonical order.
 */
export type LaunchQueue =
	| 'launchable'
	| 'waiting-capacity'
	| 'waiting-approval'
	| 'blocked'
	| 'active'
	| 'needs-human'
	| 'in-pr'
	| 'done'

/** Canonical left-to-right display order. Must match `LaunchQueue::ALL`. */
export const LAUNCH_QUEUES: readonly LaunchQueue[] = [
	'launchable',
	'waiting-capacity',
	'waiting-approval',
	'blocked',
	'active',
	'needs-human',
	'in-pr',
	'done'
] as const

export interface LaunchQueueLinkedIssue {
	identifier: string
	title: string
	url: string
}

/**
 * Discriminated union matching the `#[serde(tag = "kind")]` wire shape of
 * `LaunchQueueWireItem`. `Issue` items represent Linear work with no live
 * run; `Run` items represent Superkick work (live or recently shipped).
 */
export type LaunchQueueItem =
	| {
			kind: 'issue'
			issue: LinearIssueListItem
			bucket: LaunchQueue
			reason: string
	  }
	| {
			kind: 'run'
			run: Run
			linked_issue?: LaunchQueueLinkedIssue
			bucket: LaunchQueue
			reason: string
			pending_attention_count: number
			pending_interrupt_count: number
			pr?: LinkedPrSummary
	  }

export interface LaunchQueueActiveCapacity {
	current: number
	max: number
}

export interface LaunchQueueResponse {
	generated_at: string
	active_capacity: LaunchQueueActiveCapacity
	groups: Record<LaunchQueue, LaunchQueueItem[]>
}

export interface DispatchFromQueueRequest {
	use_worktree?: boolean
	execution_mode?: ExecutionMode
	operator_instructions?: string
}
