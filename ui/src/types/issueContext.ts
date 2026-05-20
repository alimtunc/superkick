import type { IssueAssignee, IssueStatus } from './issues'
import type { RunState } from './runs'

/** Snapshot taken when the issue was attached — not the live state. */
export interface IssueSnapshot {
	id: string
	identifier: string
	title: string
	/** Markdown body. Empty string when no description. */
	description: string
	status: IssueStatus
	captured_at: string
}

export interface IssueCommentExcerpt {
	id: string
	author: IssueAssignee | null
	text: string
	captured_at: string
}

export type IssueLinkedItemKind = 'launch_task' | 'run' | 'conversation'

export interface IssueLinkedItemRef {
	kind: IssueLinkedItemKind
	id: string
	label: string
	/** Optional status badge — populated for runs / launch tasks where known. */
	state: RunState | string | null
	captured_at: string
}

export type KnownMemoryRole =
	| 'plan'
	| 'planner'
	| 'decision'
	| 'fact'
	| 'note'
	| 'warning'
	| 'error'
	| 'failure'
	| 'review'
	| 'reviewer'
	| 'coder'
	| 'implementor'
	| 'implementer'

/** Free string at the wire boundary; narrowed by `memoryRoleTone`. */
export type MemoryRole = KnownMemoryRole | (string & {})

export interface MemoryEntry {
	id: string
	role: MemoryRole
	author: string | null
	text: string
	created_at: string
}

/** Newest-first paginated memory page (cursor-based). */
export interface MemoryEntriesPage {
	entries: MemoryEntry[]
	next_cursor: string | null
}

/** Aggregate read shape; memory paginates separately via `MemoryEntriesPage`. */
export interface IssueWorkspaceContext {
	snapshot: IssueSnapshot
	comment_excerpts: IssueCommentExcerpt[]
	linked_items: IssueLinkedItemRef[]
}
