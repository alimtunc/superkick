import type { IssuePrDiffFile, PrState } from './pr'
import type { Run } from './runs'

export type ReviewBucket =
	| 'needs_your_review'
	| 'changes_requested'
	| 'ready_to_merge'
	| 'created_by_you'
	| 'waiting_for_review'
	| 'drafts'
	| 'completed'

export type GithubReviewDecision =
	| 'approved'
	| 'changes_requested'
	| 'commented'
	| 'pending'
	| 'dismissed'
	| 'review_required'

export type PrReviewEventKind = 'comment' | 'approve' | 'request_changes'

export interface PrReviewer {
	login: string
	state?: GithubReviewDecision | null
}

export type PrChecksState = 'pending' | 'passing' | 'failing'

export interface PrChecksSummary {
	state: PrChecksState
	total: number
	passing: number
	failing: number
	pending: number
}

export interface PrInboxItem {
	repoSlug: string
	number: number
	title: string
	url: string
	state: PrState
	isDraft: boolean
	author: string
	headBranch: string
	baseBranch: string
	headSha: string
	reviewers: PrReviewer[]
	reviewDecision?: GithubReviewDecision | null
	reviewCommentCount: number
	bucket: ReviewBucket
	linkedIssueIdentifier?: string | null
	checks?: PrChecksSummary | null
	updatedAt: string
}

export interface PrReviewDetail {
	pullRequest: PrInboxItem
	body?: string | null
	linkedIssueId?: string | null
	createdAt: string
}

export type PrReviewTab = 'activity' | 'diff'

export type PrActivityKind = 'opened' | 'review_requested' | 'commented' | 'review_submitted'

export interface PrActivityEvent {
	kind: PrActivityKind
	actor: string
	body?: string | null
	decision?: GithubReviewDecision | null
	filePath?: string | null
	createdAt: string
}

export interface PrDiffResponse {
	files: IssuePrDiffFile[]
}

export interface SubmitPrReviewRequest {
	headSha: string
	event: PrReviewEventKind
	body: string
}

export interface SubmitPrReviewResponse {
	anchoredComments: number
	fallbackComments: number
}

export interface PrFixWithAiResponse {
	run: Run
	unresolvedCommentCount: number
	linked: boolean
}
