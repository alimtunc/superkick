import { Suspense, lazy, useRef, useState } from 'react'

import { useInView } from '@/hooks/useInView'
import { splitPath } from '@/lib/path'
import type { DiffViewMode, FileDiff, FileDiffStatus } from '@/types'
import { Icon } from '@/ui/Icon'

const DiffPatchView = lazy(() =>
	import('@/components/diff/DiffPatchView').then((m) => ({ default: m.DiffPatchView }))
)

const STATUS_LABEL: Record<FileDiffStatus, string> = {
	added: 'A',
	modified: 'M',
	deleted: 'D',
	renamed: 'R',
	type_change: 'T',
	untracked: 'U'
}

const STATUS_COLOR: Record<FileDiffStatus, string> = {
	added: 'var(--success)',
	modified: 'var(--warn)',
	deleted: 'var(--danger)',
	renamed: 'var(--accent)',
	type_change: 'var(--fg-muted)',
	untracked: 'var(--fg-muted)'
}

interface FileDiffRowProps {
	file: FileDiff
	mode: DiffViewMode
}

export function FileDiffRow({ file, mode }: FileDiffRowProps) {
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
		<div className="border-b border-(--border-faint)">
			<button
				type="button"
				onClick={onToggle}
				disabled={!canExpand}
				className="filerow w-full text-left hover:bg-surface focus-visible:bg-surface focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent"
				aria-expanded={canExpand ? expanded : undefined}
			>
				{canExpand ? (
					<Icon name={expanded ? 'chevDown' : 'chev'} size={12} className="shrink-0 text-fg-dim" />
				) : (
					<span className="inline-block w-3 shrink-0" aria-hidden="true" />
				)}
				<span
					className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border border-border bg-canvas text-[10px]"
					style={{ color: STATUS_COLOR[file.status] }}
					title={file.status}
				>
					{STATUS_LABEL[file.status]}
				</span>
				<span className="filerow__path" title={renderedPath}>
					<span className="dir">{dir}</span>
					{name}
				</span>
				<span className="filerow__stat">
					<span className="add">+{file.additions}</span>
					<span className="del">−{file.deletions}</span>
				</span>
			</button>
			{file.binary ? <p className="px-7 pb-3 text-[11px] text-fg-muted">binary file</p> : null}
			{file.truncated && !file.binary ? (
				<p className="px-7 pb-3 text-[11px] text-fg-muted">patch truncated</p>
			) : null}
			{expanded && canExpand && file.patch ? (
				<div ref={patchRef} className="mx-4 mb-3">
					{inView ? (
						<Suspense
							fallback={
								<pre className="terminal overflow-x-auto whitespace-pre">{file.patch}</pre>
							}
						>
							<DiffPatchView
								patch={file.patch}
								path={file.path}
								oldPath={file.oldPath}
								mode={mode}
								deletions={file.deletions}
							/>
						</Suspense>
					) : (
						<pre className="terminal overflow-x-auto whitespace-pre">{file.patch}</pre>
					)}
				</div>
			) : null}
		</div>
	)
}
