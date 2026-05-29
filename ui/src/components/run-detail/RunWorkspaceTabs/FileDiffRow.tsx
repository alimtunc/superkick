import { useState } from 'react'

import type { FileDiff, FileDiffStatus } from '@/types'
import { ChevronDown, ChevronRight } from 'lucide-react'

const STATUS_LABEL: Record<FileDiffStatus, string> = {
	added: 'A',
	modified: 'M',
	deleted: 'D',
	renamed: 'R',
	type_change: 'T',
	untracked: 'U'
}

const STATUS_TONE: Record<FileDiffStatus, string> = {
	added: 'text-success',
	modified: 'text-warn',
	deleted: 'text-danger',
	renamed: 'text-info',
	type_change: 'text-fg-muted',
	untracked: 'text-fg-muted'
}

interface FileDiffRowProps {
	file: FileDiff
}

export function FileDiffRow({ file }: FileDiffRowProps) {
	const [expanded, setExpanded] = useState(false)
	const canExpand = !file.binary && !file.truncated && typeof file.patch === 'string'
	const Caret = expanded ? ChevronDown : ChevronRight

	const onToggle = () => {
		if (canExpand) setExpanded((v) => !v)
	}

	return (
		<li>
			<button
				type="button"
				onClick={onToggle}
				disabled={!canExpand}
				className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-raised focus-visible:bg-raised focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent"
				aria-expanded={canExpand ? expanded : undefined}
			>
				{canExpand ? (
					<Caret size={12} strokeWidth={1.85} className="shrink-0 text-fg-dim" aria-hidden="true" />
				) : (
					<span className="inline-block w-3 shrink-0" aria-hidden="true" />
				)}
				<span
					className={`font-data inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] ${STATUS_TONE[file.status]}`}
					title={file.status}
				>
					{STATUS_LABEL[file.status]}
				</span>
				<span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg" title={file.path}>
					{file.status === 'renamed' && file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
				</span>
				<span className="font-data shrink-0 text-[11px] text-success">+{file.additions}</span>
				<span className="font-data shrink-0 text-[11px] text-danger">−{file.deletions}</span>
			</button>
			{file.binary ? <p className="px-7 pb-3 text-[11px] text-fg-muted">binary file</p> : null}
			{file.truncated && !file.binary ? (
				<p className="px-7 pb-3 text-[11px] text-fg-muted">patch truncated</p>
			) : null}
			{expanded && canExpand && file.patch ? (
				<pre className="bg-ink mx-4 mb-3 overflow-x-auto rounded border border-border px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre">
					{file.patch}
				</pre>
			) : null}
		</li>
	)
}
