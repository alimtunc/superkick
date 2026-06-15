import {
	createRunReviewComment,
	createRunReviewThread,
	deleteRunReviewThread,
	fetchRunReview,
	fixRunReviewWithAi,
	patchRunReviewThread,
	setRunReviewFileReviewed
} from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { DiffReviewSubject } from '@/types'

import { type UseDiffReviewResult, useDiffReview } from './useDiffReview'

interface UseRunDiffReviewOptions {
	runId: string | null
	issueId: string | null
	baseRef: string
	headRef: string
	enabled: boolean
}

export function useRunDiffReview({
	runId,
	issueId,
	baseRef,
	headRef,
	enabled
}: UseRunDiffReviewOptions): UseDiffReviewResult {
	const subject: DiffReviewSubject | null = runId ? { type: 'run', runId } : null
	return useDiffReview({
		subject,
		reviewQueryKey: queryKeys.runs.review(runId ?? 'none'),
		fetchReview: () => fetchRunReview(runId ?? ''),
		baseRef,
		headRef,
		issueId,
		enabled,
		api: {
			createThread: (req) => createRunReviewThread(runId ?? '', req),
			createComment: (threadId, req) => createRunReviewComment(runId ?? '', threadId, req),
			patchThread: (threadId, req) => patchRunReviewThread(runId ?? '', threadId, req),
			deleteThread: (threadId) => deleteRunReviewThread(runId ?? '', threadId),
			setFileReviewed: (req) => setRunReviewFileReviewed(runId ?? '', req),
			fixWithAi: () => fixRunReviewWithAi(runId ?? '')
		}
	})
}
