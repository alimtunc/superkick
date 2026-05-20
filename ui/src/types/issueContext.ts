/** Snapshot taken when the issue was attached — not the live state. */
export interface IssueSnapshot {
	id: string
	identifier: string
	title: string
	/** Markdown body. Empty string when no description. */
	description: string
	/** Plain status name captured at attach time. The live status (color +
	 *  type) is rendered separately by the consumers that have it. */
	status_name: string
	captured_at: string
}

export interface IssueCommentExcerpt {
	id: string
	/** Plain author display name; `null` when the comment was system-generated. */
	author: string | null
	text: string
	captured_at: string
}

export type IssueLinkedItemKind = 'launch_task' | 'run' | 'conversation'

export interface IssueLinkedItemRef {
	kind: IssueLinkedItemKind
	id: string
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
