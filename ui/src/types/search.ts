import type { SKIconName } from './icons'
import type { RunState } from './runs'

export type SearchScope = 'all' | 'issues' | 'comments' | 'files' | 'runs' | 'actions'

export type SearchActionKind =
	| 'launch-task'
	| 'new-issue'
	| 'switch-view'
	| 'switch-repo'
	| 'open-inbox'
	| 'jump-to-issues'
	| 'jump-to-tasks'
	| 'jump-to-runs'
	| 'jump-to-agents'

/** Subset of `SearchActionKind` the empty-state Quick Actions row can render. */
export type CommandActionKind = Extract<
	SearchActionKind,
	'launch-task' | 'new-issue' | 'switch-view' | 'switch-repo' | 'open-inbox'
>

export interface QuickAction {
	id: string
	kind: CommandActionKind
	label: string
	hint?: string
	icon: SKIconName
	target?: string
	kbdHints?: string[]
}

export interface JumpTarget {
	id: string
	label: string
	icon: SKIconName
	target: string
	badge?: number
}

export interface SearchIssueRow {
	id: string
	identifier: string
	title: string
	stateType: string
	priorityValue: number
	project: string | null
	assigneeName: string | null
	updatedAt: string
}

export interface SearchCommentRow {
	commentId: string
	issueId: string
	issueIdentifier: string
	authorName: string | null
	createdAt: string
	snippet: string
	matchStart: number
	matchEnd: number
}

export interface SearchFileRow {
	path: string
	repo: string
	modifiedAt: string | null
}

export interface SearchRunRow {
	runId: string
	issueIdentifier: string | null
	repoSlug: string
	state: RunState
	currentStep: string | null
	agentName: string | null
	createdAt: string
}

export interface SearchActionRow {
	id: string
	kind: SearchActionKind
	label: string
	hint: string | null
	target: string | null
	kbdHints: string[]
}

export interface SearchResponse {
	issues: SearchIssueRow[]
	comments: SearchCommentRow[]
	files: SearchFileRow[]
	runs: SearchRunRow[]
	actions: SearchActionRow[]
	total: number
}

export interface SearchParams {
	q: string
	scope: SearchScope
	includeDone: boolean
	limit?: number
}
