/** Raw Linear workflow state type. Superkick operator buckets are derived from this. */
export type LinearStateType = 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled'

export interface IssueStatus {
	/** Raw Linear workflow state type — used to derive operator buckets. */
	state_type: LinearStateType
	name: string
	color: string
}

export interface IssuePriority {
	value: number
	label: string
}

export interface IssueLabel {
	name: string
	color: string
}

export interface IssueAssignee {
	name: string
	avatar_url: string | null
}

export interface IssueParentRef {
	id: string
	identifier: string
	title: string
}

export interface IssueChildRef {
	id: string
	identifier: string
	title: string
	status: IssueStatus
	priority: IssuePriority
	labels: IssueLabel[]
	assignee: IssueAssignee | null
	updated_at: string
}

export interface IssueProject {
	name: string
}

export interface IssueCycle {
	name: string | null
	number: number
}

export interface IssueComment {
	id: string
	body: string
	author: IssueAssignee | null
	created_at: string
	updated_at: string
	parent_id: string | null
}

export interface LinearIssueListItem {
	id: string
	identifier: string
	title: string
	status: IssueStatus
	priority: IssuePriority
	labels: IssueLabel[]
	assignee: IssueAssignee | null
	project: IssueProject | null
	parent: IssueParentRef | null
	children: IssueChildRef[]
	url: string
	created_at: string
	updated_at: string
}

export interface IssueListResponse {
	issues: LinearIssueListItem[]
	total_count: number
}

// ── Linear issues (detail contract — SUP-16) ─────────────────────────
//
// Compatibility:
// - SUP-17 (Start action): uses `id` + `identifier` from this shape.
// - SUP-19 (run history linkage): `linked_runs` populated server-side.
// - SUP-21 (review context): `comments` carries latest review context.

import type { LinkedRunSummary } from './runs'

export interface IssueDetailResponse {
	// Required: identity & status
	id: string
	identifier: string
	title: string
	status: IssueStatus
	priority: IssuePriority
	url: string
	created_at: string
	updated_at: string

	// Required: detail-specific
	/** Markdown body. Empty string when no description. */
	description: string

	// Optional: metadata for launch decision
	labels: IssueLabel[]
	assignee: IssueAssignee | null
	project: IssueProject | null
	cycle: IssueCycle | null
	estimate: number | null
	due_date: string | null
	parent: IssueParentRef | null
	children: IssueChildRef[]

	// Optional: review-relevant context (SUP-21 ready)
	comments: IssueComment[]

	// Optional: linked run state (SUP-19 ready)
	linked_runs: LinkedRunSummary[]
}

// ── Operator-facing classification ────────────────────────────────────
//
// Superkick derivations — NOT Linear states. Linear remains the source of truth;
// buckets exist to make the Issues surface actionable for launch and inspection.

export type IssueBucket = 'ready' | 'active' | 'done' | 'dismissed'

export interface ClassifiedIssues {
	ready: LinearIssueListItem[]
	active: LinearIssueListItem[]
	done: LinearIssueListItem[]
	dismissed: LinearIssueListItem[]
}

export type BucketFilter = IssueBucket | 'all'

// ── Parent/child grouping ─────────────────────────────────────────────

export interface IssueGroup {
	parent: LinearIssueListItem
	children: LinearIssueListItem[]
}

export interface GroupedIssues {
	groups: IssueGroup[]
	standalone: LinearIssueListItem[]
}

// ── Comment tree (view model) ─────────────────────────────────────────

export interface CommentNode {
	comment: IssueComment
	children: CommentNode[]
}
