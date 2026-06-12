import { useMemo, useState } from 'react'

import {
	createRunReviewComment,
	createRunReviewThread,
	deleteRunReviewThread,
	fixRunReviewWithAi,
	patchRunReviewThread,
	setRunReviewFileReviewed
} from '@/api'
import { runReviewQuery } from '@/lib/queries'
import { queryKeys } from '@/lib/queryKeys'
import type {
	DiffPatchReview,
	DiffReviewAnchor,
	DiffReviewState,
	DiffReviewThread,
	FileDiff,
	Run
} from '@/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

interface UseRunDiffReviewOptions {
	runId: string | null
	issueId: string | null
	baseRef: string
	headRef: string
	enabled: boolean
}

interface UseRunDiffReviewResult {
	reviewReady: boolean
	isReviewLoading: boolean
	reviewError: Error | null
	review: DiffReviewState
	reviewedFiles: Set<string>
	unresolvedByFile: Map<string, number>
	reviewForFile: (file: FileDiff) => DiffPatchReview | undefined
	onReviewedChange: (file: FileDiff, reviewed: boolean) => void
	fixWithAi: {
		start: () => void
		isPending: boolean
		error: Error | null
		fixRun: Run | null
	}
}

export function useRunDiffReview({
	runId,
	issueId,
	baseRef,
	headRef,
	enabled
}: UseRunDiffReviewOptions): UseRunDiffReviewResult {
	const queryClient = useQueryClient()
	const {
		data: reviewData,
		isLoading: isReviewLoading,
		error: reviewError
	} = useQuery(runReviewQuery(runId, enabled))
	const [fixRunState, setFixRunState] = useState<{ sourceRunId: string; run: Run } | null>(null)
	const fixRun = fixRunState !== null && fixRunState.sourceRunId === runId ? fixRunState.run : null

	const reviewReady = Boolean(reviewData) && !isReviewLoading && !reviewError
	const review = useMemo(() => reviewData ?? emptyReviewState(runId ?? ''), [reviewData, runId])
	const threadsByFile = useMemo(() => groupThreadsByFile(review.threads), [review.threads])
	const unresolvedByFile = useMemo(() => countUnresolvedCommentsByFile(review.threads), [review.threads])
	const reviewedFiles = useMemo(() => reviewedFileSet(review), [review])

	const invalidateReview = () => {
		if (runId) void queryClient.invalidateQueries({ queryKey: queryKeys.runs.review(runId) })
	}

	const createThread = useMutation({
		mutationFn: ({ id, anchor, body }: { id: string; anchor: DiffReviewAnchor; body: string }) =>
			createRunReviewThread(id, {
				issueId: anchor.issueId ?? issueId,
				filePath: anchor.filePath,
				oldPath: anchor.oldPath ?? null,
				side: anchor.side,
				oldLine: anchor.oldLine ?? null,
				oldLineEnd: anchor.oldLineEnd ?? null,
				newLine: anchor.newLine ?? null,
				newLineEnd: anchor.newLineEnd ?? null,
				hunkHeader: anchor.hunkHeader ?? null,
				hunkIndex: anchor.hunkIndex ?? null,
				baseRef: anchor.baseRef ?? null,
				headRef: anchor.headRef ?? null,
				body
			}),
		onSuccess: invalidateReview
	})
	const createComment = useMutation({
		mutationFn: ({ id, threadId, body }: { id: string; threadId: string; body: string }) =>
			createRunReviewComment(id, threadId, { body }),
		onSuccess: invalidateReview
	})
	const updateThread = useMutation({
		mutationFn: ({ id, threadId, resolved }: { id: string; threadId: string; resolved: boolean }) =>
			patchRunReviewThread(id, threadId, { resolved }),
		onSuccess: invalidateReview
	})
	const deleteThread = useMutation({
		mutationFn: ({ id, threadId }: { id: string; threadId: string }) =>
			deleteRunReviewThread(id, threadId),
		onSuccess: invalidateReview
	})
	const setReviewed = useMutation({
		mutationFn: ({ id, file, reviewed }: { id: string; file: FileDiff; reviewed: boolean }) =>
			setRunReviewFileReviewed(id, {
				filePath: file.path,
				oldPath: file.oldPath ?? null,
				reviewed
			}),
		onSuccess: invalidateReview
	})
	const fixWithAiMutation = useMutation({
		mutationFn: (id: string) => fixRunReviewWithAi(id),
		onMutate: () => {
			setFixRunState(null)
		},
		onSuccess: () => {
			invalidateReview()
			void queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
		}
	})

	const reviewForFile = (file: FileDiff): DiffPatchReview | undefined => {
		if (!reviewReady || !runId) return undefined
		return {
			runId,
			filePath: file.path,
			oldPath: file.oldPath ?? null,
			baseRef,
			headRef,
			threads: threadsByFile.get(file.path) ?? [],
			onCreateThread: async (anchor, body) => {
				await createThread.mutateAsync({ id: runId, anchor, body })
			},
			onReply: async (threadId, body) => {
				await createComment.mutateAsync({ id: runId, threadId, body })
			},
			onResolve: async (threadId, resolved) => {
				await updateThread.mutateAsync({ id: runId, threadId, resolved })
			},
			onDeleteThread: (threadId) => deleteThread.mutateAsync({ id: runId, threadId })
		}
	}

	const onReviewedChange = (file: FileDiff, reviewed: boolean) => {
		if (runId) setReviewed.mutate({ id: runId, file, reviewed })
	}

	const startFixWithAi = () => {
		if (!runId) return
		fixWithAiMutation.mutate(runId, {
			onSuccess: (result) => {
				setFixRunState({ sourceRunId: runId, run: result.run })
			}
		})
	}

	return {
		reviewReady,
		isReviewLoading,
		reviewError: reviewError instanceof Error ? reviewError : null,
		review,
		reviewedFiles,
		unresolvedByFile,
		reviewForFile,
		onReviewedChange,
		fixWithAi: {
			start: startFixWithAi,
			isPending: fixWithAiMutation.isPending,
			error: fixWithAiMutation.error instanceof Error ? fixWithAiMutation.error : null,
			fixRun
		}
	}
}

function emptyReviewState(runId: string): DiffReviewState {
	return {
		runId,
		threads: [],
		reviewedFiles: [],
		unresolvedThreadCount: 0,
		unresolvedCommentCount: 0
	}
}

function groupThreadsByFile(threads: DiffReviewThread[]): Map<string, DiffReviewThread[]> {
	const grouped = new Map<string, DiffReviewThread[]>()
	for (const thread of threads) {
		const current = grouped.get(thread.anchor.filePath) ?? []
		grouped.set(thread.anchor.filePath, [...current, thread])
	}
	return grouped
}

function countUnresolvedCommentsByFile(threads: DiffReviewThread[]): Map<string, number> {
	const counts = new Map<string, number>()
	for (const thread of threads) {
		if (thread.state !== 'open') continue
		counts.set(thread.anchor.filePath, (counts.get(thread.anchor.filePath) ?? 0) + thread.comments.length)
	}
	return counts
}

function reviewedFileSet(review: DiffReviewState): Set<string> {
	const reviewed = new Set<string>()
	for (const file of review.reviewedFiles) {
		if (file.reviewed) reviewed.add(file.filePath)
	}
	return reviewed
}
