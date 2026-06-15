import type {
	CreateDiffReviewCommentRequest,
	CreateDiffReviewThreadRequest,
	DiffReviewComment,
	DiffReviewFileState,
	DiffReviewState,
	DiffReviewThread,
	PatchDiffReviewThreadRequest,
	PrActivityEvent,
	PrDiffResponse,
	PrFixWithAiResponse,
	PrInboxItem,
	PrReviewDetail,
	SetDiffReviewFileReviewedRequest,
	SubmitPrReviewRequest,
	SubmitPrReviewResponse
} from '@/types'

import { deleteVoid, getJson, patchJson, postJson, postJsonChecked } from './_shared'

export async function fetchReviewInbox(): Promise<PrInboxItem[]> {
	return getJson('/pull-requests', 'fetch reviews inbox failed')
}

export async function fetchPrDetail(number: number): Promise<PrReviewDetail> {
	return getJson(`/pull-requests/${number}`, 'fetch pull request failed')
}

export async function fetchPrDiff(number: number): Promise<PrDiffResponse> {
	return getJson(`/pull-requests/${number}/diff`, 'fetch pull request diff failed')
}

export async function fetchPrActivity(number: number): Promise<PrActivityEvent[]> {
	return getJson(`/pull-requests/${number}/activity`, 'fetch pull request activity failed')
}

export async function fetchPrReview(number: number, headSha: string): Promise<DiffReviewState> {
	return getJson(
		`/pull-requests/${number}/review?headSha=${encodeURIComponent(headSha)}`,
		'fetch pull request review failed'
	)
}

export async function createPrReviewThread(
	number: number,
	headSha: string,
	body: CreateDiffReviewThreadRequest
): Promise<DiffReviewThread> {
	return postJson(`/pull-requests/${number}/review/threads`, 'create review thread failed', {
		...body,
		headSha
	})
}

export async function createPrReviewComment(
	number: number,
	threadId: string,
	body: CreateDiffReviewCommentRequest
): Promise<DiffReviewComment> {
	return postJson(
		`/pull-requests/${number}/review/threads/${threadId}/comments`,
		'create review comment failed',
		body
	)
}

export async function patchPrReviewThread(
	number: number,
	threadId: string,
	body: PatchDiffReviewThreadRequest
): Promise<DiffReviewThread> {
	return patchJson(
		`/pull-requests/${number}/review/threads/${threadId}`,
		'update review thread failed',
		body
	)
}

export async function deletePrReviewThread(number: number, threadId: string): Promise<void> {
	await deleteVoid(`/pull-requests/${number}/review/threads/${threadId}`, 'delete review thread failed')
}

export async function setPrReviewFileReviewed(
	number: number,
	headSha: string,
	body: SetDiffReviewFileReviewedRequest
): Promise<DiffReviewFileState> {
	return postJson(`/pull-requests/${number}/review/files/reviewed`, 'set file reviewed failed', {
		...body,
		headSha
	})
}

export async function submitPrReview(
	number: number,
	body: SubmitPrReviewRequest
): Promise<SubmitPrReviewResponse> {
	return postJson(`/pull-requests/${number}/review/submit`, 'submit review failed', body)
}

export async function fixPrReviewWithAi(number: number, headSha: string): Promise<PrFixWithAiResponse> {
	return postJsonChecked(
		`/pull-requests/${number}/review/fix-with-ai?headSha=${encodeURIComponent(headSha)}`,
		'fix review with ai failed'
	)
}
