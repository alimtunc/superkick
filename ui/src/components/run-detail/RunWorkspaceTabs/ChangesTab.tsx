import { type ReactNode, useMemo, useState } from 'react'

import {
	createRunReviewComment,
	createRunReviewThread,
	deleteRunReviewThread,
	fixRunReviewWithAi,
	patchRunReviewThread,
	setRunReviewFileReviewed
} from '@/api'
import { FileDiffRow } from '@/components/run-detail/RunWorkspaceTabs/FileDiffRow'
import { PullRequestHeader } from '@/components/run-detail/RunWorkspaceTabs/PullRequestHeader'
import { TabEmptyState } from '@/components/ui/state-empty-tab'
import { errorMessageOr } from '@/lib/errors'
import { runDiffQuery, runReviewQuery } from '@/lib/queries'
import { queryKeys } from '@/lib/queryKeys'
import type {
	DiffPatchReview,
	DiffReviewAnchor,
	DiffReviewState,
	DiffReviewThread,
	DiffViewMode,
	FileDiff,
	PullRequest,
	Run,
	RunState
} from '@/types'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDiff as FileDiffIcon } from 'lucide-react'

const TOGGLE_CLASS =
	'rounded-[3px] px-2 py-0.5 text-[11px] text-fg-dim hover:text-fg data-[pressed]:bg-surface data-[pressed]:text-fg'

interface ChangesTabProps {
	run: Run
	pr: PullRequest | null
}

const NON_DIFFABLE_STATES: ReadonlySet<RunState> = new Set<RunState>(['queued', 'preparing'])

export function ChangesTab({ run, pr }: ChangesTabProps) {
	const enabled = !NON_DIFFABLE_STATES.has(run.state)
	const { data, isLoading, error } = useQuery(runDiffQuery(run.id, enabled))
	const {
		data: reviewData,
		isLoading: isReviewLoading,
		error: reviewError
	} = useQuery(runReviewQuery(run.id, enabled))
	const queryClient = useQueryClient()
	const [mode, setMode] = useState<DiffViewMode>('unified')
	const [selectedPath, setSelectedPath] = useState<string | null>(null)
	const [fixRunState, setFixRunState] = useState<{ sourceRunId: string; run: Run } | null>(null)
	const fixRun = fixRunState?.sourceRunId === run.id ? fixRunState.run : null

	const header = pr ? <PullRequestHeader pr={pr} /> : null
	const reviewReady = Boolean(reviewData) && !isReviewLoading && !reviewError
	const review = useMemo(() => reviewData ?? emptyReviewState(run.id), [reviewData, run.id])
	const threadsByFile = useMemo(() => groupThreadsByFile(review.threads), [review.threads])
	const unresolvedByFile = useMemo(() => countUnresolvedCommentsByFile(review.threads), [review.threads])
	const reviewedFiles = useMemo(() => reviewedFileSet(review), [review])
	const createThread = useMutation({
		mutationFn: ({ anchor, body }: { anchor: DiffReviewAnchor; body: string }) =>
			createRunReviewThread(run.id, {
				issueId: anchor.issueId ?? run.issue_id,
				filePath: anchor.filePath,
				oldPath: anchor.oldPath ?? null,
				side: anchor.side,
				oldLine: anchor.oldLine ?? null,
				newLine: anchor.newLine ?? null,
				hunkHeader: anchor.hunkHeader ?? null,
				hunkIndex: anchor.hunkIndex ?? null,
				baseRef: anchor.baseRef ?? null,
				headRef: anchor.headRef ?? null,
				body
			}),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.runs.review(run.id) })
		}
	})
	const createComment = useMutation({
		mutationFn: ({ threadId, body }: { threadId: string; body: string }) =>
			createRunReviewComment(run.id, threadId, { body }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.runs.review(run.id) })
		}
	})
	const updateThread = useMutation({
		mutationFn: ({ threadId, resolved }: { threadId: string; resolved: boolean }) =>
			patchRunReviewThread(run.id, threadId, { resolved }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.runs.review(run.id) })
		}
	})
	const deleteThread = useMutation({
		mutationFn: (threadId: string) => deleteRunReviewThread(run.id, threadId),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.runs.review(run.id) })
		}
	})
	const setReviewed = useMutation({
		mutationFn: ({ file, reviewed }: { file: FileDiff; reviewed: boolean }) =>
			setRunReviewFileReviewed(run.id, {
				filePath: file.path,
				oldPath: file.oldPath ?? null,
				reviewed
			}),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.runs.review(run.id) })
		}
	})
	const fixWithAi = useMutation({
		mutationFn: () => fixRunReviewWithAi(run.id),
		onMutate: () => {
			setFixRunState(null)
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.runs.review(run.id) })
			void queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
		}
	})
	const startFixWithAi = () => {
		fixWithAi.mutate(undefined, {
			onSuccess: (result) => {
				setFixRunState({ sourceRunId: run.id, run: result.run })
			}
		})
	}

	if (!enabled || isLoading) {
		return (
			<ChangesTabShell header={header}>
				<TabEmptyState icon={FileDiffIcon} title="Loading file changes…" />
			</ChangesTabShell>
		)
	}

	if (error) {
		return (
			<ChangesTabShell header={header}>
				<TabEmptyState
					icon={FileDiffIcon}
					title="File diff unavailable"
					description="The diff endpoint failed. Refresh the page to retry."
				/>
			</ChangesTabShell>
		)
	}

	if (data?.kind === 'unavailable') {
		const description =
			data.reason === 'not_worktree_backed'
				? 'This run did not use a worktree, so per-file diffs are not collected.'
				: 'The worktree has been cleaned up — no file diff is available.'
		return (
			<ChangesTabShell header={header}>
				<TabEmptyState icon={FileDiffIcon} title="No diff captured" description={description} />
			</ChangesTabShell>
		)
	}

	const diff = data?.value.diff
	if (!diff || diff.files.length === 0) {
		return (
			<ChangesTabShell header={header}>
				<TabEmptyState
					icon={FileDiffIcon}
					title="No file changes yet"
					description="Diffs will appear here once the run edits files in its worktree."
				/>
			</ChangesTabShell>
		)
	}

	const selectedFile = diff.files.find((file) => file.path === selectedPath) ?? diff.files[0]
	const selectedThreads = threadsByFile.get(selectedFile.path) ?? []
	const selectedReview: DiffPatchReview | undefined = reviewReady
		? {
				runId: run.id,
				filePath: selectedFile.path,
				oldPath: selectedFile.oldPath ?? null,
				baseRef: diff.baseRef,
				headRef: diff.headRef,
				threads: selectedThreads,
				onCreateThread: async (anchor, body) => {
					await createThread.mutateAsync({ anchor, body })
				},
				onReply: async (threadId, body) => {
					await createComment.mutateAsync({ threadId, body })
				},
				onResolve: async (threadId, resolved) => {
					await updateThread.mutateAsync({ threadId, resolved })
				},
				onDeleteThread: (threadId) => deleteThread.mutateAsync(threadId)
			}
		: undefined
	const reviewedCount = diff.files.filter((file) => reviewedFiles.has(file.path)).length
	const reviewStatus = reviewError
		? 'Review state unavailable'
		: isReviewLoading
			? 'Loading review state...'
			: null
	const fixError = fixWithAi.error ? errorMessageOr(fixWithAi.error, 'Fix with AI failed') : null

	return (
		<ChangesTabShell header={header}>
			<div className="flex items-center gap-4 px-4 py-3 text-[12px] text-fg-dim">
				<span className="mono">{diff.baseRef.slice(0, 7)}</span>
				<span aria-hidden="true">→</span>
				<span className="mono">{diff.headRef.slice(0, 7)}</span>
				<span aria-hidden="true">·</span>
				<span>
					{diff.fileCount} file{diff.fileCount === 1 ? '' : 's'}
				</span>
				{diff.overflow ? <span>· capped</span> : null}
				<span aria-hidden="true">·</span>
				<span>
					{review.unresolvedCommentCount} unresolved comment
					{review.unresolvedCommentCount === 1 ? '' : 's'}
				</span>
				<span aria-hidden="true">·</span>
				<span>
					{reviewedCount}/{diff.fileCount} reviewed
				</span>
				{reviewStatus ? (
					<>
						<span aria-hidden="true">·</span>
						<span className={reviewError ? 'text-danger' : undefined}>{reviewStatus}</span>
					</>
				) : null}
				<ToggleGroup<DiffViewMode>
					value={[mode]}
					onValueChange={(value) => {
						const next = value[0]
						if (next) setMode(next)
					}}
					aria-label="Diff layout"
					className="ml-auto flex items-center gap-1"
				>
					<Toggle value="unified" className={TOGGLE_CLASS}>
						Unified
					</Toggle>
					<Toggle value="split" className={TOGGLE_CLASS}>
						Split
					</Toggle>
				</ToggleGroup>
				<button
					type="button"
					onClick={startFixWithAi}
					disabled={
						!reviewReady ||
						review.unresolvedCommentCount === 0 ||
						fixWithAi.isPending ||
						fixRun !== null
					}
					className="rounded-[3px] border border-border px-2 py-0.5 text-[11px] text-fg-dim hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
				>
					Fix with AI
				</button>
			</div>
			{fixRun ? (
				<p
					className="border-t border-(--border-faint) px-4 py-2 text-[12px] text-success"
					role="status"
				>
					Fix run started.{' '}
					<a className="underline-offset-2 hover:underline" href={`/runs/${fixRun.id}`}>
						Open run {fixRun.id.slice(0, 8)}
					</a>
				</p>
			) : null}
			{fixError ? (
				<p
					className="border-t border-(--border-faint) px-4 py-2 text-[12px] text-danger"
					role="alert"
				>
					{fixError}
				</p>
			) : null}
			<div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[240px_minmax(0,1fr)]">
				<div className="min-h-0 overflow-auto md:col-start-2 md:row-start-1">
					<FileDiffRow
						key={selectedFile.path}
						file={selectedFile}
						mode={mode}
						review={selectedReview}
					/>
				</div>
				<aside className="border-t border-(--border-faint) bg-canvas md:col-start-1 md:row-start-1 md:border-t-0 md:border-r">
					<div className="px-3 py-2 text-[11px] font-medium tracking-[0.08em] text-fg-muted uppercase">
						Files
					</div>
					<div className="max-h-72 overflow-auto md:max-h-none">
						{diff.files.map((file) => {
							const unresolved = unresolvedByFile.get(file.path) ?? 0
							const reviewed = reviewedFiles.has(file.path)
							const selected = selectedFile.path === file.path
							const fileControl =
								diff.files.length === 1 ? (
									<div className="min-w-0 flex-1 px-2 py-1 text-[12px] text-fg-dim">
										<span className="block truncate">{file.path}</span>
										<span className="text-[11px] text-fg-muted">
											{unresolved} unresolved
										</span>
									</div>
								) : (
									<button
										type="button"
										onClick={() => setSelectedPath(file.path)}
										aria-pressed={selected}
										aria-label={fileButtonLabel(file.path, unresolved)}
										className="min-w-0 flex-1 rounded-[3px] px-2 py-1 text-left text-[12px] text-fg-dim hover:bg-surface hover:text-fg aria-pressed:bg-surface aria-pressed:text-fg"
									>
										<span className="block truncate">{file.path}</span>
										<span className="text-[11px] text-fg-muted">
											{unresolved} unresolved
										</span>
									</button>
								)
							return (
								<div key={file.path} className="flex items-center gap-2 px-2 py-1">
									{fileControl}
									<input
										type="checkbox"
										checked={reviewed}
										onChange={(event) =>
											setReviewed.mutate({ file, reviewed: event.target.checked })
										}
										disabled={!reviewReady}
										aria-label={`Mark ${file.path} as ${reviewed ? 'not reviewed' : 'reviewed'}`}
										className="h-4 w-4 shrink-0 accent-[var(--accent)]"
									/>
								</div>
							)
						})}
					</div>
				</aside>
			</div>
		</ChangesTabShell>
	)
}

function ChangesTabShell({ header, children }: { header: ReactNode; children: ReactNode }) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			{header}
			{children}
		</div>
	)
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

function fileButtonLabel(filePath: string, unresolved: number): string {
	const suffix = unresolved === 1 ? 'comment' : 'comments'
	return `${filePath}, ${unresolved} unresolved ${suffix}`
}
