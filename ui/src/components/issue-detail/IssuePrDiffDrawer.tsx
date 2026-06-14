import { useMemo, useState } from 'react'

import { DiffErrorBoundary } from '@/components/diff/DiffErrorBoundary'
import { DiffFileNavigator } from '@/components/diff/DiffFileNavigator'
import { PrBadge } from '@/components/pr/PrBadge'
import { FileDiffRow } from '@/components/run-detail/RunWorkspaceTabs/FileDiffRow'
import { SideDrawer } from '@/components/ui/side-drawer'
import { EmptyState } from '@/components/ui/state-empty'
import { useRunDiffReview } from '@/hooks/useRunDiffReview'
import { fileSectionId } from '@/lib/diff/fileSections'
import { withGitDiffHeader } from '@/lib/diff/githubPatch'
import { errorMessageOr } from '@/lib/errors'
import { issuePullRequestDiffQuery } from '@/lib/queries'
import type {
	DiffViewMode,
	FileDiff,
	FileDiffStatus,
	IssueDetailResponse,
	IssuePrDiffFileStatus,
	IssuePullRequest
} from '@/types'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useQuery } from '@tanstack/react-query'
import { FileDiff as FileDiffIcon } from 'lucide-react'

const TOGGLE_CLASS =
	'rounded-[3px] px-2 py-0.5 text-[11px] text-fg-dim hover:text-fg data-[pressed]:bg-surface data-[pressed]:text-fg'

const SECTION_ID_PREFIX = 'issue-pr-file'

interface IssuePrDiffDrawerProps {
	issue: IssueDetailResponse
	pr: IssuePullRequest | null
	open: boolean
	onClose: () => void
}

export function IssuePrDiffDrawer({ issue, pr, open, onClose }: IssuePrDiffDrawerProps) {
	const [mode, setMode] = useState<DiffViewMode>('unified')
	const [fileFilter, setFileFilter] = useState('')
	const { data, isLoading, error } = useQuery(issuePullRequestDiffQuery(issue.id, pr, open))
	const files = useMemo(() => data?.files.map(toFileDiff) ?? [], [data])
	const rawPatch = useMemo(() => combinePatches(files), [files])
	const linkedRunId = useMemo(() => resolveLinkedRunId(issue, pr), [issue, pr])
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
		runId: linkedRunId,
		issueId: issue.id,
		baseRef: data?.pr.base_branch ?? pr?.base_branch ?? '',
		headRef: data?.pr.head_sha ?? pr?.head_sha ?? '',
		enabled: open && linkedRunId !== null
	})

	if (!pr) return null

	const showReview = linkedRunId !== null
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

	return (
		<SideDrawer
			open={open}
			onClose={onClose}
			title="Pull request diff"
			closeAriaLabel="Close pull request diff"
			width="two-thirds"
			resizable
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className="border-b border-border px-4 py-3">
					<div className="flex min-w-0 items-center gap-2">
						<PrBadge pr={data?.pr ?? pr} size="sm" />
						<span className="min-w-0 truncate text-[13px] font-medium text-fg">
							{data?.pr.title || pr.title || `Pull request #${pr.number}`}
						</span>
					</div>
					<div className="mt-1 flex min-w-0 items-center gap-2 text-[12px] text-fg-dim">
						<span className="mono truncate">{pr.repo_slug}</span>
						{(data?.pr.head_branch || pr.head_branch) &&
						(data?.pr.base_branch || pr.base_branch) ? (
							<>
								<span aria-hidden="true">/</span>
								<span className="mono truncate">
									{data?.pr.base_branch || pr.base_branch} &lt;-{' '}
									{data?.pr.head_branch || pr.head_branch}
								</span>
							</>
						) : null}
					</div>
				</div>

				{isLoading ? (
					<EmptyDiffState title="Loading PR diff..." />
				) : error ? (
					<EmptyDiffState title="PR diff unavailable" />
				) : files.length === 0 ? (
					<EmptyDiffState title="No file changes" />
				) : (
					<>
						<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 text-[12px] text-fg-dim">
							<span className="flex items-center gap-2">
								<FileDiffIcon size={14} strokeWidth={1.75} aria-hidden="true" />
								{files.length} file{files.length === 1 ? '' : 's'}
							</span>
							{showReview ? (
								<>
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
											<span className={reviewError ? 'text-danger' : undefined}>
												{reviewStatus}
											</span>
										</>
									) : null}
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
								{showReview ? (
									<button
										type="button"
										onClick={fixWithAi.start}
										disabled={fixDisabled}
										className="rounded-[3px] border border-border px-2 py-0.5 text-[11px] text-fg-dim hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
									>
										Fix with AI
									</button>
								) : null}
							</div>
						</div>
						{fixWithAi.fixRun ? (
							<p
								className="border-b border-(--border-faint) px-4 py-2 text-[12px] text-success"
								role="status"
							>
								Fix run started.{' '}
								<a
									className="underline-offset-2 hover:underline"
									href={`/runs/${fixWithAi.fixRun.id}`}
								>
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
						<div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[240px_minmax(0,1fr)]">
							<DiffFileNavigator
								files={files}
								filter={fileFilter}
								onFilterChange={setFileFilter}
								reviewedFiles={reviewedFiles}
								unresolvedByFile={unresolvedByFile}
								sectionIdPrefix={SECTION_ID_PREFIX}
								searchId="issue-pr-file-search"
								showReview={showReview}
							/>
							<div className="min-h-0 overflow-y-auto md:col-start-2 md:row-start-1">
								<DiffErrorBoundary patch={rawPatch}>
									{files.map((file, index) => (
										<FileDiffRow
											key={`${file.path}:${file.oldPath ?? ''}`}
											id={fileSectionId(SECTION_ID_PREFIX, index)}
											file={file}
											mode={mode}
											showReview={showReview}
											reviewed={reviewedFiles.has(file.path)}
											unresolvedCount={unresolvedByFile.get(file.path) ?? 0}
											reviewDisabled={!reviewReady}
											review={reviewForFile(file)}
											onReviewedChange={onReviewedChange}
										/>
									))}
								</DiffErrorBoundary>
							</div>
						</div>
					</>
				)}
			</div>
		</SideDrawer>
	)
}

function EmptyDiffState({ title }: { title: string }) {
	return (
		<div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
			<EmptyState icon={FileDiffIcon} title={title} density="compact" className="w-full max-w-sm" />
		</div>
	)
}

function combinePatches(files: FileDiff[]): string {
	return files
		.map((file) => file.patch)
		.filter((patch): patch is string => typeof patch === 'string')
		.join('\n')
}

function resolveLinkedRunId(issue: IssueDetailResponse, pr: IssuePullRequest | null): string | null {
	if (!pr) return null
	return issue.linked_runs.find((run) => run.pr?.number === pr.number)?.id ?? null
}

function toFileDiff(file: {
	path: string
	old_path?: string | null
	status: IssuePrDiffFileStatus
	additions: number
	deletions: number
	patch?: string | null
}): FileDiff {
	const status = toFileDiffStatus(file.status)
	return {
		path: file.path,
		status,
		oldPath: file.old_path,
		additions: file.additions,
		deletions: file.deletions,
		binary: false,
		truncated: false,
		patch: file.patch ? withGitDiffHeader(file.patch, file.path, file.old_path, status) : file.patch
	}
}

function toFileDiffStatus(status: IssuePrDiffFileStatus): FileDiffStatus {
	switch (status) {
		case 'added':
			return 'added'
		case 'removed':
			return 'deleted'
		case 'renamed':
			return 'renamed'
		case 'modified':
		case 'changed':
		case 'unchanged':
			return 'modified'
	}
}
