import type { Run } from './runs'

export interface ReviewFinding {
	agent_name: string
	session_id: string
	passed: boolean
	exit_code: number | null
}

export interface ReviewSwarmResult {
	findings: ReviewFinding[]
	total_agents: number
	passed_count: number
	failed_count: number
	gate_passed: boolean
}

export type DiffReviewLineSide = 'old' | 'new' | 'context'

export type DiffReviewThreadState = 'open' | 'resolved'

// What a local diff review is anchored to: a run or a GitHub PR.
export type DiffReviewSubject =
	| { type: 'run'; runId: string }
	| { type: 'pull_request'; repoSlug: string; number: number; headSha: string }

export interface DiffReviewAnchor {
	subject: DiffReviewSubject
	issueId?: string | null
	filePath: string
	oldPath?: string | null
	side: DiffReviewLineSide
	oldLine?: number | null
	oldLineEnd?: number | null
	newLine?: number | null
	newLineEnd?: number | null
	hunkHeader?: string | null
	hunkIndex?: number | null
	baseRef?: string | null
	headRef?: string | null
}

export interface DiffPatchReview {
	subject: DiffReviewSubject
	filePath: string
	oldPath?: string | null
	baseRef: string
	headRef: string
	threads: DiffReviewThread[]
	onCreateThread: (anchor: DiffReviewAnchor, body: string) => Promise<void> | void
	onReply: (threadId: string, body: string) => Promise<void> | void
	onResolve: (threadId: string, resolved: boolean) => Promise<void> | void
	onDeleteThread: (threadId: string) => Promise<void> | void
}

export interface DiffReviewComment {
	id: string
	threadId: string
	author: string
	body: string
	createdAt: string
	updatedAt: string
}

export interface DiffReviewThread {
	id: string
	anchor: DiffReviewAnchor
	state: DiffReviewThreadState
	author: string
	createdAt: string
	updatedAt: string
	comments: DiffReviewComment[]
}

export interface DiffReviewFileState {
	subject: DiffReviewSubject
	issueId?: string | null
	filePath: string
	oldPath?: string | null
	reviewed: boolean
	reviewer?: string | null
	updatedAt: string
}

export interface DiffReviewState {
	subject: DiffReviewSubject
	threads: DiffReviewThread[]
	reviewedFiles: DiffReviewFileState[]
	unresolvedThreadCount: number
	unresolvedCommentCount: number
}

export interface CreateDiffReviewThreadRequest {
	issueId?: string | null
	filePath: string
	oldPath?: string | null
	side: DiffReviewLineSide
	oldLine?: number | null
	oldLineEnd?: number | null
	newLine?: number | null
	newLineEnd?: number | null
	hunkHeader?: string | null
	hunkIndex?: number | null
	baseRef?: string | null
	headRef?: string | null
	author?: string | null
	body: string
}

export interface CreateDiffReviewCommentRequest {
	author?: string | null
	body: string
}

export interface PatchDiffReviewThreadRequest {
	resolved: boolean
}

export interface SetDiffReviewFileReviewedRequest {
	issueId?: string | null
	filePath: string
	oldPath?: string | null
	reviewed: boolean
	reviewer?: string | null
}

export interface FixRunReviewWithAiResponse {
	run: Run
	unresolvedCommentCount: number
}
