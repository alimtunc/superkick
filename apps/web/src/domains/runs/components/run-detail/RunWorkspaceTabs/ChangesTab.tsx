import { type ReactNode, useState } from 'react'

import { TabEmptyState } from '@/components/primitives'
import { DiffFileNavigator } from '@/domains/diff/components/DiffFileNavigator'
import { FileDiffRow } from '@/domains/runs/components/run-detail/RunWorkspaceTabs/FileDiffRow'
import { PullRequestHeader } from '@/domains/runs/components/run-detail/RunWorkspaceTabs/PullRequestHeader'
import { useRunDiffReview } from '@/hooks/useRunDiffReview'
import { fileSectionId } from '@/lib/diff/fileSections'
import { errorMessageOr } from '@/lib/errors'
import { runDiffQuery } from '@/lib/queries'
import type {
	DiffPatchReview,
	DiffReviewState,
	DiffViewMode,
	FileDiff,
	PullRequest,
	Run,
	RunDiff,
	RunState
} from '@/types'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useQuery } from '@tanstack/react-query'
import { FileDiff as FileDiffIcon } from 'lucide-react'

const TOGGLE_CLASS =
	'rounded-[3px] px-2 py-0.5 text-[11px] text-fg-dim hover:text-fg data-[pressed]:bg-surface data-[pressed]:text-fg'

const SECTION_ID_PREFIX = 'changed-file'

interface ChangesTabProps {
	run: Run
	pr: PullRequest | null
}

const NON_DIFFABLE_STATES: ReadonlySet<RunState> = new Set<RunState>(['queued', 'preparing'])

export function ChangesTab({ run, pr }: ChangesTabProps) {
	const enabled = !NON_DIFFABLE_STATES.has(run.state)
	const { data, isLoading, error } = useQuery(runDiffQuery(run.id, enabled))
	const diffValue = data?.kind === 'ok' ? data.value.diff : null
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
	} = useRunDiffReview({
		runId: run.id,
		issueId: run.issue_id,
		baseRef: diffValue?.baseRef ?? '',
		headRef: diffValue?.headRef ?? '',
		enabled
	})
	const [mode, setMode] = useState<DiffViewMode>('unified')
	const [fileFilter, setFileFilter] = useState('')

	const header = pr ? <PullRequestHeader pr={pr} /> : null

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
				onFixWithAi={fixWithAi.start}
				fixDisabled={fixDisabled}
			/>
			<FixRunStatus fixRun={fixWithAi.fixRun} fixError={fixError} />
			<div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)]">
				<DiffFileNavigator
					files={diff.files}
					filter={fileFilter}
					onFilterChange={setFileFilter}
					reviewedFiles={reviewedFiles}
					unresolvedByFile={unresolvedByFile}
					sectionIdPrefix={SECTION_ID_PREFIX}
					searchId="changed-file-search"
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
					id={fileSectionId(SECTION_ID_PREFIX, index)}
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
