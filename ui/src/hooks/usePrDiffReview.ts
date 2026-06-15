import {
	createPrReviewComment,
	createPrReviewThread,
	deletePrReviewThread,
	fetchPrReview,
	fixPrReviewWithAi,
	patchPrReviewThread,
	setPrReviewFileReviewed
} from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { DiffReviewSubject } from '@/types'

import { type UseDiffReviewResult, useDiffReview } from './useDiffReview'

interface UsePrDiffReviewOptions {
	repoSlug: string
	number: number
	headSha: string
	baseRef: string
	headRef: string
	issueId?: string | null
	enabled: boolean
}

export function usePrDiffReview({
	repoSlug,
	number,
	headSha,
	baseRef,
	headRef,
	issueId,
	enabled
}: UsePrDiffReviewOptions): UseDiffReviewResult {
	const subject: DiffReviewSubject | null = headSha
		? { type: 'pull_request', repoSlug, number, headSha }
		: null
	return useDiffReview({
		subject,
		reviewQueryKey: queryKeys.reviews.localReview(number, headSha),
		fetchReview: () => fetchPrReview(number, headSha),
		baseRef,
		headRef,
		issueId,
		enabled,
		api: {
			createThread: (req) => createPrReviewThread(number, headSha, req),
			createComment: (threadId, req) => createPrReviewComment(number, threadId, req),
			patchThread: (threadId, req) => patchPrReviewThread(number, threadId, req),
			deleteThread: (threadId) => deletePrReviewThread(number, threadId),
			setFileReviewed: (req) => setPrReviewFileReviewed(number, headSha, req),
			fixWithAi: () => fixPrReviewWithAi(number, headSha)
		}
	})
}
