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
	RunDiff,
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

interface IndexedFileDiff {
	file: FileDiff
	index: number
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
	const [fileFilter, setFileFilter] = useState('')
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
				oldLineEnd: anchor.oldLineEnd ?? null,
				newLine: anchor.newLine ?? null,
				newLineEnd: anchor.newLineEnd ?? null,
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

	const reviewedCount = diff.files.filter((file) => reviewedFiles.has(file.path)).length
	const indexedFiles = filterIndexedFiles(diff.files, fileFilter)
	const reviewForFile = (file: FileDiff): DiffPatchReview | undefined => {
		if (!reviewReady) return undefined
		return {
			runId: run.id,
			filePath: file.path,
			oldPath: file.oldPath ?? null,
			baseRef: diff.baseRef,
			headRef: diff.headRef,
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
			onDeleteThread: (threadId) => deleteThread.mutateAsync(threadId)
		}
	}
	const onReviewedChange = (file: FileDiff, reviewed: boolean) => {
		setReviewed.mutate({ file, reviewed })
	}
	const reviewStatus = reviewError
		? 'Review state unavailable'
		: isReviewLoading
			? 'Loading review state...'
			: null
	const fixError = fixWithAi.error ? errorMessageOr(fixWithAi.error, 'Fix with AI failed') : null
	const fixDisabled =
		!reviewReady || review.unresolvedCommentCount === 0 || fixWithAi.isPending || fixRun !== null

	return (
		<ChangesTabShell header={header}>
			<ChangesSummaryBar
				diff={diff}
				review={review}
				reviewedCount={reviewedCount}
				reviewStatus={reviewStatus}
				reviewStatusIsError={Boolean(reviewError)}
				mode={mode}
				onModeChange={setMode}
				onFixWithAi={startFixWithAi}
				fixDisabled={fixDisabled}
			/>
			<FixRunStatus fixRun={fixRun} fixError={fixError} />
			<div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)]">
				<FileNavigator
					files={indexedFiles}
					filter={fileFilter}
					onFilterChange={setFileFilter}
					reviewedFiles={reviewedFiles}
					unresolvedByFile={unresolvedByFile}
				/>
				<FileDiffStack
					files={diff.files}
					mode={mode}
					reviewReady={reviewReady}
					reviewedFiles={reviewedFiles}
					unresolvedByFile={unresolvedByFile}
					reviewForFile={reviewForFile}
					onReviewedChange={onReviewedChange}
				/>
			</div>
		</ChangesTabShell>
	)
}

interface ChangesSummaryBarProps {
	diff: RunDiff
	review: DiffReviewState
	reviewedCount: number
	reviewStatus: string | null
	reviewStatusIsError: boolean
	mode: DiffViewMode
	onModeChange: (mode: DiffViewMode) => void
	onFixWithAi: () => void
	fixDisabled: boolean
}

function ChangesSummaryBar({
	diff,
	review,
	reviewedCount,
	reviewStatus,
	reviewStatusIsError,
	mode,
	onModeChange,
	onFixWithAi,
	fixDisabled
}: ChangesSummaryBarProps) {
	return (
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
					<span className={reviewStatusIsError ? 'text-danger' : undefined}>{reviewStatus}</span>
				</>
			) : null}
			<ToggleGroup<DiffViewMode>
				value={[mode]}
				onValueChange={(value) => {
					const next = value[0]
					if (next) onModeChange(next)
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
				onClick={onFixWithAi}
				disabled={fixDisabled}
				className="rounded-[3px] border border-border px-2 py-0.5 text-[11px] text-fg-dim hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
			>
				Fix with AI
			</button>
		</div>
	)
}

function FixRunStatus({ fixRun, fixError }: { fixRun: Run | null; fixError: string | null }) {
	return (
		<>
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
		</>
	)
}

interface FileNavigatorProps {
	files: IndexedFileDiff[]
	filter: string
	onFilterChange: (filter: string) => void
	reviewedFiles: Set<string>
	unresolvedByFile: Map<string, number>
}

function FileNavigator({
	files,
	filter,
	onFilterChange,
	reviewedFiles,
	unresolvedByFile
}: FileNavigatorProps) {
	return (
		<aside className="flex min-h-0 flex-col border-t border-border bg-canvas md:col-start-1 md:row-start-1 md:border-t-0 md:border-r">
			<div className="border-b border-border px-3 py-2">
				<label
					htmlFor="changed-file-search"
					className="block text-[11px] font-medium tracking-[0.08em] text-fg-muted uppercase"
				>
					Files
				</label>
				<input
					id="changed-file-search"
					type="search"
					value={filter}
					onChange={(event) => onFilterChange(event.target.value)}
					aria-label="Search changed files"
					placeholder="Search files"
					className="mt-2 h-7 w-full rounded-[4px] border border-border bg-surface px-2 font-mono text-[12px] text-fg outline-none placeholder:text-fg-dim focus:border-border-strong focus-visible:ring-2 focus-visible:ring-accent/40"
				/>
			</div>
			<div className="max-h-72 min-h-0 overflow-auto py-1 md:max-h-none">
				{files.length === 0 ? (
					<p className="px-3 py-2 text-[12px] text-fg-muted">No matching files</p>
				) : null}
				{files.map(({ file, index }) => {
					const unresolved = unresolvedByFile.get(file.path) ?? 0
					const reviewed = reviewedFiles.has(file.path)
					return (
						<button
							key={file.path}
							type="button"
							onClick={() => scrollToFile(index)}
							aria-label={fileJumpLabel(file.path, unresolved)}
							className="group flex w-full items-start gap-2 px-3 py-2 text-left text-[12px] text-fg-dim hover:bg-surface hover:text-fg focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
						>
							<span
								className={
									reviewed
										? 'mt-1 size-1.5 shrink-0 rounded-full bg-success'
										: 'mt-1 size-1.5 shrink-0 rounded-full bg-border'
								}
								aria-hidden="true"
							/>
							<span className="min-w-0 flex-1">
								<span className="block truncate font-mono text-[12px]">{file.path}</span>
								<span className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-fg-muted">
									<span>+{file.additions}</span>
									<span>−{file.deletions}</span>
									<span>{unresolved} unresolved</span>
								</span>
							</span>
						</button>
					)
				})}
			</div>
		</aside>
	)
}

interface FileDiffStackProps {
	files: FileDiff[]
	mode: DiffViewMode
	reviewReady: boolean
	reviewedFiles: Set<string>
	unresolvedByFile: Map<string, number>
	reviewForFile: (file: FileDiff) => DiffPatchReview | undefined
	onReviewedChange: (file: FileDiff, reviewed: boolean) => void
}

function FileDiffStack({
	files,
	mode,
	reviewReady,
	reviewedFiles,
	unresolvedByFile,
	reviewForFile,
	onReviewedChange
}: FileDiffStackProps) {
	return (
		<div className="min-h-0 overflow-auto md:col-start-2 md:row-start-1">
			{files.map((file, index) => (
				<FileDiffRow
					key={file.path}
					id={fileSectionId(index)}
					file={file}
					mode={mode}
					reviewed={reviewedFiles.has(file.path)}
					unresolvedCount={unresolvedByFile.get(file.path) ?? 0}
					reviewDisabled={!reviewReady}
					review={reviewForFile(file)}
					onReviewedChange={onReviewedChange}
				/>
			))}
		</div>
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

function fileJumpLabel(filePath: string, unresolved: number): string {
	const suffix = unresolved === 1 ? 'comment' : 'comments'
	return `Jump to ${filePath}, ${unresolved} unresolved ${suffix}`
}

function filterIndexedFiles(files: FileDiff[], filter: string): IndexedFileDiff[] {
	const indexedFiles = files.map((file, index) => ({ file, index }))
	const normalizedFilter = filter.trim().toLowerCase()
	if (!normalizedFilter) return indexedFiles
	return indexedFiles.filter(({ file }) =>
		`${file.path} ${file.oldPath ?? ''}`.toLowerCase().includes(normalizedFilter)
	)
}

function scrollToFile(index: number) {
	document.getElementById(fileSectionId(index))?.scrollIntoView({ block: 'start' })
}

function fileSectionId(index: number): string {
	return `changed-file-${index}`
}
