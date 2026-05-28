import type { IssueHistoryEntry } from './issueHistory'
import type { CommentNode } from './issues'
import type { LinkedRunSummary } from './runs'

export type ActivityNodeKind = 'agent' | 'user' | 'commit' | 'check' | 'flag' | 'system' | 'pr'
export type ActivityNodeRole = 'neutral' | 'accent' | 'success' | 'warn' | 'danger' | 'info'

export type IssueActivityItem =
	| { kind: 'comment'; node: CommentNode; ts: number; key: string }
	| { kind: 'run_launched'; run: LinkedRunSummary; ts: number; key: string }
	| { kind: 'run_completed'; run: LinkedRunSummary; ts: number; key: string }
	| { kind: 'history'; entry: IssueHistoryEntry; ts: number; key: string }
