import { Suspense, lazy, useRef, useState } from 'react'

import { Icon, Pill, type PillTone } from '@/components/primitives'
import { DiffErrorBoundary } from '@/domains/diff/components/DiffErrorBoundary'
import { useInView } from '@/hooks/useInView'
import { splitPath } from '@/lib/path'
import type { DiffPatchReview, DiffViewMode, FileDiff, FileDiffStatus } from '@/types'

const DiffPatchView = lazy(() =>
	import('@/domains/diff/components/DiffPatchView').then((m) => ({ default: m.DiffPatchView }))
)

const STATUS_LABEL: Record<FileDiffStatus, string> = {
	added: 'Added',
	modified: 'Modified',
	deleted: 'Deleted',
	renamed: 'Renamed',
	type_change: 'Type changed',
	untracked: 'Untracked'
}

const STATUS_TONE: Record<FileDiffStatus, PillTone> = {
	added: 'success',
	modified: 'warn',
	deleted: 'danger',
	renamed: 'accent',
	type_change: 'neutral',
	untracked: 'neutral'
}

interface FileDiffRowProps {
	file: FileDiff
	mode: DiffViewMode
	id?: string
	reviewed?: boolean
	unresolvedCount?: number
	reviewDisabled?: boolean
	review?: DiffPatchReview
	showReview?: boolean
	onReviewedChange?: (file: FileDiff, reviewed: boolean) => void
}

export function FileDiffRow({
	file,
	mode,
	id,
	reviewed = false,
	unresolvedCount = 0,
	reviewDisabled = false,
	review,
	showReview = true,
	onReviewedChange
}: FileDiffRowProps) {
	const [expanded, setExpanded] = useState(true)
	const patchRef = useRef<HTMLDivElement>(null)
	const inView = useInView(patchRef)
	const canExpand = !file.binary && !file.truncated && typeof file.patch === 'string'
	const renderedPath =
		file.status === 'renamed' && file.oldPath ? `${file.oldPath} → ${file.path}` : file.path
	const { dir, name } = splitPath(renderedPath)

	const onToggle = () => {
		if (canExpand) setExpanded((v) => !v)
	}

	return (
		<section id={id} aria-label={`${file.path} diff`} className="border-b border-border">
			<header className="sticky top-0 z-10 flex min-h-11 items-center gap-2 border-b border-border bg-surface/95 px-4 backdrop-blur-md">
				<button
					type="button"
					onClick={onToggle}
					disabled={!canExpand}
					className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-[3px] px-1 py-1 text-left hover:bg-raised/40 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent"
					aria-expanded={canExpand ? expanded : undefined}
				>
					{canExpand ? (
						<Icon
							name={expanded ? 'chevDown' : 'chev'}
							size={12}
							className="shrink-0 text-fg-dim"
						/>
					) : (
						<span className="inline-block w-3 shrink-0" aria-hidden="true" />
					)}
					<Pill tone={STATUS_TONE[file.status]} mono>
						{STATUS_LABEL[file.status]}
					</Pill>
					<span className="min-w-0 truncate font-mono text-[12px] text-fg" title={renderedPath}>
						<span className="text-fg-dim">{dir}</span>
						{name}
					</span>
				</button>
				<span className="hidden shrink-0 items-center gap-1 font-mono text-[11px] sm:inline-flex">
					<span className="text-success">+{file.additions}</span>
					<span className="text-danger">−{file.deletions}</span>
				</span>
				{showReview ? (
					<>
						<span className="shrink-0 rounded border border-border bg-canvas px-1.5 py-0.5 font-mono text-[10.5px] text-fg-muted">
							{unresolvedCount} unresolved
						</span>
						<label className="inline-flex h-7 shrink-0 items-center gap-2 rounded border border-border bg-canvas px-2 text-[11.5px] text-fg-muted transition-colors hover:border-border-strong hover:text-fg">
							<input
								type="checkbox"
								checked={reviewed}
								onChange={(event) => onReviewedChange?.(file, event.target.checked)}
								disabled={reviewDisabled}
								aria-label={`Mark ${file.path} as ${reviewed ? 'not reviewed' : 'reviewed'}`}
								className="size-3.5 accent-[var(--accent)] disabled:cursor-not-allowed"
							/>
							Reviewed
						</label>
					</>
				) : null}
			</header>
			{file.binary ? <p className="px-7 pb-3 text-[11px] text-fg-muted">binary file</p> : null}
			{file.truncated && !file.binary ? (
				<p className="px-7 pb-3 text-[11px] text-fg-muted">patch truncated</p>
			) : null}
			{expanded && canExpand && file.patch ? (
				<div ref={patchRef} className="mx-4 my-3">
					{inView ? (
						<DiffErrorBoundary patch={file.patch}>
							<Suspense
								fallback={
									<pre className="terminal overflow-x-auto whitespace-pre">
										{file.patch}
									</pre>
								}
							>
								<DiffPatchView
									patch={file.patch}
									path={file.path}
									oldPath={file.oldPath}
									mode={mode}
									review={review}
								/>
							</Suspense>
						</DiffErrorBoundary>
					) : (
						<pre className="terminal overflow-x-auto whitespace-pre">{file.patch}</pre>
					)}
				</div>
			) : null}
		</section>
	)
}
