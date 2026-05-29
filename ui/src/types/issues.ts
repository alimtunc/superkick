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
	id: string
	name: string
	avatar_url: string | null
}

/**
 * Identity payload from `GET /me`. The Linear viewer's `id` is the canonical
 * "assigned to me" key — name collisions / renames make name-match unsafe.
 */
export interface ViewerResponse {
	id: string
	name: string
	avatar_url: string | null
}

export interface IssueParentRef {
	id: string
	identifier: string
	title: string
	status: IssueStatus
}

/**
 * Issue that blocks another via a Linear `blocks` relation (SUP-81).
 * Same shape as `IssueParentRef` — the `status` is hydrated so the UI can
 * render the blocker's current state without a second lookup.
 */
export interface IssueBlockerRef {
	id: string
	identifier: string
	title: string
	status: IssueStatus
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
	/** Linear team UUID — lets the kanban PATCH skip the team-lookup round-trip. */
	team_id: string | null
	priority: IssuePriority
	labels: IssueLabel[]
	assignee: IssueAssignee | null
	project: IssueProject | null
	parent: IssueParentRef | null
	children: IssueChildRef[]
	/** Linear `blocks` relations gating this issue (SUP-81). Empty when none. */
	blocked_by: IssueBlockerRef[]
	url: string
	created_at: string
	updated_at: string
	/** Linear `completedAt` — single source of truth for the shipped window.
	 *  Null when the issue is not in a completed/canceled workflow state. */
	completed_at: string | null
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

import type { IssueHistoryEntry } from './issueHistory'
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
	/** Linear `blocks` relations gating this issue (SUP-81). Empty when none. */
	blocked_by: IssueBlockerRef[]

	/** Linear team UUID — required client-side so status / label pickers can
	 *  scope to the issue's team. Null only when Linear withheld it. */
	team_id: string | null

	// Optional: review-relevant context (SUP-21 ready)
	comments: IssueComment[]

	// Optional: linked run state (SUP-19 ready)
	linked_runs: LinkedRunSummary[]

	history?: IssueHistoryEntry[]
	history_has_more?: boolean
}

// ── Operator-facing classification ────────────────────────────────────
//
// Superkick derivations — NOT Linear states. Linear remains the source of truth;
// buckets exist to make the Issues surface actionable for launch and inspection.

/** Operator-facing issue state (SUP-157). `needs_human` / `in_review` are derived from runtime signals — read-only. `backlog` / `todo` are the two Linear unstarted lanes (display-only; both persist as the mutable `open`). */
export type IssueState = 'needs_human' | 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done'

/** Subset of `IssueState` the kanban can persist via `PATCH /issues/{id}`. Mirrors the backend `IssueStateMutable` (backlog/todo both write back as the unstarted `open`). */
export type IssueStateMutable = Extract<IssueState, 'in_progress' | 'done'> | 'open'

export type IssueStateFilter = IssueState | 'all'

// ── Write contracts (SUP-183) ─────────────────────────────────────────

/** Mirrors Rust `Patchable<T>`: `undefined` = omit, `null` = clear, `T` = set. */
export type Patchable<T> = T | null | undefined

export interface IssueCreateRequest {
	team_id: string
	title: string
	description?: string
	state_id?: string
	assignee_id?: string
	priority?: number
	label_ids?: string[]
	project_id?: string
	due_date?: string
	estimate?: number
}

/** PATCH body — assignee/project/due_date/estimate accept `null` to clear; everything else is `T | undefined`. */
export interface IssueUpdateRequest {
	title?: string
	description?: string
	state_id?: string
	team_id?: string
	assignee_id?: Patchable<string>
	priority?: number
	label_ids?: string[]
	project_id?: Patchable<string>
	due_date?: Patchable<string>
	estimate?: Patchable<number>
}

// ── Comment tree (view model) ─────────────────────────────────────────

export interface CommentNode {
	comment: IssueComment
	children: CommentNode[]
}
