import { useMemo, useRef, useState } from 'react'

import {
	type ImperativePanelHandle,
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup
} from '@/components/composites/resizable'
import { EmptyState, ErrorState, LoadingState } from '@/components/primitives'
import { DiffErrorBoundary } from '@/domains/diff/components/DiffErrorBoundary'
import { DiffFileNavigator } from '@/domains/diff/components/DiffFileNavigator'
import { FileDiffRow } from '@/domains/runs/components/run-detail/RunWorkspaceTabs/FileDiffRow'
import { usePrDiff } from '@/hooks/usePrDiff'
import { usePrDiffReview } from '@/hooks/usePrDiffReview'
import { fileSectionId } from '@/lib/diff/fileSections'
import { combinePatches, toFileDiff } from '@/lib/diff/prDiffFile'
import { errorMessageOr } from '@/lib/errors'
import type { DiffViewMode, PrReviewDetail } from '@/types'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { FileDiff as FileDiffIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react'

const FILES_LAYOUT_ID = 'pr-review-diff-files'

import { SubmitReviewBar } from './SubmitReviewBar'

const TOGGLE_CLASS =
	'rounded-[3px] px-2 py-0.5 text-[11px] text-fg-dim hover:text-fg data-[pressed]:bg-surface data-[pressed]:text-fg'

const SECTION_ID_PREFIX = 'pr-review-file'

interface PrDiffTabProps {
	detail: PrReviewDetail
}

export function PrDiffTab({ detail }: PrDiffTabProps) {
	const pr = detail.pullRequest
	const [mode, setMode] = useState<DiffViewMode>('unified')
	const [fileFilter, setFileFilter] = useState('')
	const [filesCollapsed, setFilesCollapsed] = useState(false)
	const filesPanelRef = useRef<ImperativePanelHandle>(null)
	const { data, isLoading, error, refetch } = usePrDiff(pr.number)
	const files = useMemo(() => data?.files.map(toFileDiff) ?? [], [data])
	const rawPatch = useMemo(() => combinePatches(files), [files])

	const {
		reviewReady,
		isReviewLoading,
		reviewError,
		review,
		reviewedFiles,
		unresolvedByFile,
		reviewForFile,
		onReviewedChange,
		fixWithAi
	} = usePrDiffReview({
		repoSlug: pr.repoSlug,
		number: pr.number,
		headSha: pr.headSha,
		baseRef: pr.baseBranch,
		headRef: pr.headSha,
		issueId: detail.linkedIssueId,
		enabled: true
	})

	if (isLoading) return <LoadingState rows={6} />
	if (error) {
		return (
			<ErrorState
				message={errorMessageOr(error, 'PR diff unavailable')}
				onRetry={() => void refetch()}
				density="compact"
			/>
		)
	}
	if (files.length === 0) {
		return <EmptyState icon={FileDiffIcon} title="No file changes" density="compact" />
	}

	const reviewedCount = files.filter((file) => reviewedFiles.has(file.path)).length
	const reviewStatus = reviewError
		? 'Review state unavailable'
		: isReviewLoading
			? 'Loading review state...'
			: null
	const fixError = fixWithAi.error ? errorMessageOr(fixWithAi.error, 'Fix with AI failed') : null
	const fixDisabled =
		!reviewReady ||
		review.unresolvedCommentCount === 0 ||
		fixWithAi.isPending ||
		fixWithAi.fixRun !== null

	function toggleFiles() {
		const panel = filesPanelRef.current
		if (!panel) return
		if (panel.isCollapsed()) {
			panel.expand()
		} else {
			panel.collapse()
		}
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2 text-[12px] text-fg-dim">
				<button
					type="button"
					onClick={toggleFiles}
					aria-pressed={filesCollapsed}
					title={filesCollapsed ? 'Show files' : 'Hide files'}
					className="flex items-center gap-1 rounded-[3px] border border-border px-2 py-0.5 text-[11px] text-fg-dim hover:bg-surface hover:text-fg"
				>
					{filesCollapsed ? (
						<PanelLeftOpen size={13} strokeWidth={1.75} aria-hidden="true" />
					) : (
						<PanelLeftClose size={13} strokeWidth={1.75} aria-hidden="true" />
					)}
					{filesCollapsed ? 'Show files' : 'Hide files'}
				</button>
				<span className="flex items-center gap-2">
					<FileDiffIcon size={14} strokeWidth={1.75} aria-hidden="true" />
					{files.length} file{files.length === 1 ? '' : 's'}
				</span>
				<span aria-hidden="true">·</span>
				<span>
					{review.unresolvedCommentCount} unresolved comment
					{review.unresolvedCommentCount === 1 ? '' : 's'}
				</span>
				<span aria-hidden="true">·</span>
				<span>
					{reviewedCount}/{files.length} reviewed
				</span>
				{reviewStatus ? (
					<>
						<span aria-hidden="true">·</span>
						<span className={reviewError ? 'text-danger' : undefined}>{reviewStatus}</span>
					</>
				) : null}
				<div className="ml-auto flex shrink-0 items-center gap-2">
					<ToggleGroup<DiffViewMode>
						value={[mode]}
						onValueChange={(value) => {
							const next = value[0]
							if (next) setMode(next)
						}}
						aria-label="Diff layout"
						className="flex items-center gap-1"
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
						onClick={fixWithAi.start}
						disabled={fixDisabled}
						className="rounded-[3px] border border-border px-2 py-0.5 text-[11px] text-fg-dim hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
					>
						Fix with AI
					</button>
				</div>
			</div>
			{fixWithAi.fixRun ? (
				<p
					className="border-b border-(--border-faint) px-4 py-2 text-[12px] text-success"
					role="status"
				>
					Fix run started.{' '}
					<a className="underline-offset-2 hover:underline" href={`/runs/${fixWithAi.fixRun.id}`}>
						Open run {fixWithAi.fixRun.id.slice(0, 8)}
					</a>
				</p>
			) : null}
			{fixError ? (
				<p
					className="border-b border-(--border-faint) px-4 py-2 text-[12px] text-danger"
					role="alert"
				>
					{fixError}
				</p>
			) : null}
			<ResizablePanelGroup
				direction="horizontal"
				autoSaveId={FILES_LAYOUT_ID}
				className="min-h-0 flex-1 overflow-hidden"
			>
				<ResizablePanel
					ref={filesPanelRef}
					order={1}
					collapsible
					collapsedSize={0}
					defaultSize={22}
					minSize={14}
					maxSize={45}
					onCollapse={() => setFilesCollapsed(true)}
					onExpand={() => setFilesCollapsed(false)}
					className="min-h-0"
				>
					<DiffFileNavigator
						files={files}
						filter={fileFilter}
						onFilterChange={setFileFilter}
						reviewedFiles={reviewedFiles}
						unresolvedByFile={unresolvedByFile}
						sectionIdPrefix={SECTION_ID_PREFIX}
						searchId="pr-review-file-search"
						showReview
					/>
				</ResizablePanel>
				<ResizableHandle withHandle className={filesCollapsed ? 'hidden' : undefined} />
				<ResizablePanel order={2} minSize={30} className="min-h-0">
					<div className="h-full min-h-0 overflow-y-auto">
						<DiffErrorBoundary patch={rawPatch}>
							{files.map((file, index) => (
								<FileDiffRow
									key={`${file.path}:${file.oldPath ?? ''}`}
									id={fileSectionId(SECTION_ID_PREFIX, index)}
									file={file}
									mode={mode}
									showReview
									reviewed={reviewedFiles.has(file.path)}
									unresolvedCount={unresolvedByFile.get(file.path) ?? 0}
									reviewDisabled={!reviewReady}
									review={reviewForFile(file)}
									onReviewedChange={onReviewedChange}
								/>
							))}
						</DiffErrorBoundary>
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
			<SubmitReviewBar
				number={pr.number}
				headSha={pr.headSha}
				unresolvedCount={review.unresolvedCommentCount}
			/>
		</div>
	)
}
