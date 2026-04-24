import type { LinearIssueListItem } from './issues'
import type { LinkedPrSummary } from './pr'
import type { ExecutionMode, Run } from './runs'

/**
 * Launch-queue buckets — SUP-80 + SUP-81. Derived server-side from (Linear
 * issues, Superkick runs, orchestration config). The wire shape is
 * deliberately a kebab-case string union so the columns can be rendered
 * with `.map()` over the canonical order.
 *
 * `backlog` / `todo` (SUP-81): mirror Linear's two pre-trigger workflow
 * groups (`state.type == "backlog"` / `"unstarted"`). Distinct from
 * `blocked` because nothing is gating these — the operator just hasn't
 * moved them to "In Progress" yet.
 */
export type LaunchQueue =
	| 'backlog'
	| 'todo'
	| 'launchable'
	| 'waiting'
	| 'blocked'
	| 'active'
	| 'needs-human'
	| 'in-pr'
	| 'done'

/** Canonical left-to-right display order. Must match `LaunchQueue::ALL`. */
export const LAUNCH_QUEUES: readonly LaunchQueue[] = [
	'backlog',
	'todo',
	'launchable',
	'waiting',
	'blocked',
	'active',
	'needs-human',
	'in-pr',
	'done'
] as const

/** Columns the operator must always see, even when empty — they are the
 *  intake anchors. Other columns collapse out of view when empty so the
 *  Kanban stays focused on what's actionable (SUP-81). */
export const ALWAYS_VISIBLE_QUEUES: readonly LaunchQueue[] = ['backlog', 'todo', 'launchable'] as const

/** Map of downstream issue id → resolved_at (ISO) for recently-unblocked
 *  items (SUP-81). Session-local by design — reload clears the map. */
export type RecentUnblocks = Record<string, string>

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
