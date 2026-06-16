import { useMemo, useState } from 'react'

import { queryKeys } from '@/lib/queryKeys'
import type {
	CreateDiffReviewCommentRequest,
	CreateDiffReviewThreadRequest,
	DiffPatchReview,
	DiffReviewAnchor,
	DiffReviewComment,
	DiffReviewFileState,
	DiffReviewState,
	DiffReviewSubject,
	DiffReviewThread,
	FileDiff,
	PatchDiffReviewThreadRequest,
	Run,
	SetDiffReviewFileReviewedRequest
} from '@/types'
import type { QueryKey } from '@tanstack/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// Subject-specific bindings: the run and PR surfaces differ only in their
// endpoints, so each injects its mutation/fetch functions into the shared core.
export interface DiffReviewApi {
	createThread: (req: CreateDiffReviewThreadRequest) => Promise<DiffReviewThread>
	createComment: (threadId: string, req: CreateDiffReviewCommentRequest) => Promise<DiffReviewComment>
	patchThread: (threadId: string, req: PatchDiffReviewThreadRequest) => Promise<DiffReviewThread>
	deleteThread: (threadId: string) => Promise<void>
	setFileReviewed: (req: SetDiffReviewFileReviewedRequest) => Promise<DiffReviewFileState>
	fixWithAi: () => Promise<{ run: Run; unresolvedCommentCount: number }>
}

export interface UseDiffReviewOptions {
	subject: DiffReviewSubject | null
	reviewQueryKey: QueryKey
	fetchReview: () => Promise<DiffReviewState>
	baseRef: string
	headRef: string
	issueId?: string | null
	enabled: boolean
	api: DiffReviewApi
	afterFix?: () => void
}

export interface UseDiffReviewResult {
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

export function useDiffReview({
	subject,
	reviewQueryKey,
	fetchReview,
	baseRef,
	headRef,
	issueId,
	enabled,
	api,
	afterFix
}: UseDiffReviewOptions): UseDiffReviewResult {
	const queryClient = useQueryClient()
	const key = subject ? subjectKey(subject) : null
	const {
		data: reviewData,
		isLoading: isReviewLoading,
		error: reviewError
	} = useQuery({
		queryKey: reviewQueryKey,
		queryFn: fetchReview,
		enabled: enabled && subject !== null,
		staleTime: 5_000
	})
	const [fixRunState, setFixRunState] = useState<{ key: string; run: Run } | null>(null)
	const fixRun = fixRunState !== null && fixRunState.key === key ? fixRunState.run : null

	const reviewReady = Boolean(reviewData) && !isReviewLoading && !reviewError
	const review = useMemo(() => reviewData ?? emptyReviewState(subject), [reviewData, subject])
	const threadsByFile = useMemo(() => groupThreadsByFile(review.threads), [review.threads])
	const unresolvedByFile = useMemo(() => countUnresolvedCommentsByFile(review.threads), [review.threads])
	const reviewedFiles = useMemo(() => reviewedFileSet(review), [review])

	const invalidateReview = () => {
		void queryClient.invalidateQueries({ queryKey: reviewQueryKey })
	}

	const createThread = useMutation({
		mutationFn: ({ anchor, body }: { anchor: DiffReviewAnchor; body: string }) =>
			api.createThread({
				issueId: anchor.issueId ?? issueId ?? null,
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
		mutationFn: ({ threadId, body }: { threadId: string; body: string }) =>
			api.createComment(threadId, { body }),
		onSuccess: invalidateReview
	})
	const updateThread = useMutation({
		mutationFn: ({ threadId, resolved }: { threadId: string; resolved: boolean }) =>
			api.patchThread(threadId, { resolved }),
		onSuccess: invalidateReview
	})
	const deleteThread = useMutation({
		mutationFn: ({ threadId }: { threadId: string }) => api.deleteThread(threadId),
		onSuccess: invalidateReview
	})
	const setReviewed = useMutation({
		mutationFn: ({ file, reviewed }: { file: FileDiff; reviewed: boolean }) =>
			api.setFileReviewed({ filePath: file.path, oldPath: file.oldPath ?? null, reviewed }),
		onSuccess: invalidateReview
	})
	const fixWithAiMutation = useMutation({
		mutationFn: () => api.fixWithAi(),
		onMutate: () => {
			setFixRunState(null)
		},
		onSuccess: (result) => {
			if (key) setFixRunState({ key, run: result.run })
			invalidateReview()
			void queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
			afterFix?.()
		}
	})

	const reviewForFile = (file: FileDiff): DiffPatchReview | undefined => {
		if (!reviewReady || !subject) return undefined
		return {
			subject,
			filePath: file.path,
			oldPath: file.oldPath ?? null,
			baseRef,
			headRef,
			threads: threadsByFile.get(file.path) ?? [],
			onCreateThread: async (anchor, body) => {
				await createThread.mutateAsync({ anchor, body })
			},
			onReply: async (threadId, body) => {
				await createComment.mutateAsync({ threadId, body })
			},
			onResolve: async (threadId, resolved) => {
				await updateThread.mutateAsync({ threadId, resolved })
			},
			onDeleteThread: (threadId) => deleteThread.mutateAsync({ threadId })
		}
	}

	const onReviewedChange = (file: FileDiff, reviewed: boolean) => {
		if (subject) setReviewed.mutate({ file, reviewed })
	}

	const startFixWithAi = () => {
		if (subject) fixWithAiMutation.mutate()
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

export function subjectKey(subject: DiffReviewSubject): string {
	return subject.type === 'run' ? `run:${subject.runId}` : `pr:${subject.repoSlug}#${subject.number}`
}

function emptyReviewState(subject: DiffReviewSubject | null): DiffReviewState {
	return {
		subject: subject ?? { type: 'run', runId: '' },
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
