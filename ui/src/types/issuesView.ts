import type { PillTone } from '@/components/ui/pill'

import type { IssueWithState } from './issueWithState'
import type { LifecycleBucket, StatusIconKind } from './lifecycle'

/** Saved-view tab. `mine` is the default landing — the other two are pinned. */
export type IssueViewTab = 'mine' | 'all-open' | 'shipped'

/** Sort key for the visible list. Direction is folded into the value. */
export type IssueSort = 'updated' | 'created' | 'priority' | 'age'

/**
 * Group-by axis. `lifecycle` is the operator-facing default and the only
 * axis that uses the 5-bucket lens; the others mirror Linear properties.
 */
export type IssueGroupBy = 'lifecycle' | 'status' | 'priority' | 'project' | 'assignee' | 'none'

/** List-vs-board layout switch. */
export type IssueViewLayout = 'list' | 'board'

/**
 * Filter state — purely URL-driven. Each axis stores **values** to include
 * and a parallel `*_not` list for exclusions; chips render both. Empty
 * arrays mean "no filter on this axis".
 */
export interface IssueFilterState {
	assignee: string[]
	status: string[]
	status_not: string[]
	priority: number[]
	label: string[]
	label_not: string[]
	project: string[]
	repo: string[]
	task: string[]
	created: string[]
	/** Window literals: '24h' | '7d' | '30d'. Matches `updated_at`. */
	updated: string[]
	/** Window literals: '3d' | '7d' | '30d'. Matches `completed_at` (null is excluded). */
	completed: string[]
	/** `'yes' | 'no'` — backed by `children.length > 0`. */
	has_sub_issues: string[]
}

/**
 * Resolved view-model rendered by `IssuesListView`. One per non-empty
 * bucket / group — zero-count groups are dropped upstream.
 */
export interface IssueGroup {
	key: string
	bucket: LifecycleBucket | null
	label: string
	tone: PillTone
	issues: IssueWithState[]
	/** When the group is a Linear status bucket, the matching glyph kind for the header.
	 *  Renderer falls back to a colored dot when null (priority, project, assignee, etc.). */
	statusKind: StatusIconKind | null
	/** Pinned group floats to the top of the list with warn-tinted chrome. */
	pinned: boolean
}

/**
 * Pre-grouped column projection consumed by the kanban so both surfaces
 * share the same tab/filter/showDone/viewer-scoped view-model.
 */
export type IssueBoardColumns = {
	needs_human: IssueWithState[]
	backlog: IssueWithState[]
	todo: IssueWithState[]
	in_progress: IssueWithState[]
	in_review: IssueWithState[]
	done: IssueWithState[]
}

/** Tab counts surfaced next to each `IssueViewTabs` entry. */
export interface IssueTabCounts {
	mine: number
	'all-open': number
	shipped: number
}
