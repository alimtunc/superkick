import type { IssuePrDiffFile } from '@/types'

interface ReviewFileRowProps {
	file: IssuePrDiffFile
	onOpenDiff: () => void
}

export function ReviewFileRow({ file, onOpenDiff }: ReviewFileRowProps) {
	const slash = file.path.lastIndexOf('/')
	const dir = slash >= 0 ? file.path.slice(0, slash + 1) : ''
	const name = slash >= 0 ? file.path.slice(slash + 1) : file.path
	return (
		<li>
			<button
				type="button"
				onClick={onOpenDiff}
				title={file.path}
				className="group flex w-full items-center gap-2 text-left"
			>
				<span className="min-w-0 flex-1 truncate text-[12px]">
					{dir ? <span className="text-fg-dim">{dir}</span> : null}
					<span className="text-fg-muted group-hover:text-fg">{name}</span>
				</span>
				<span className="mono shrink-0 text-[11px]">
					{file.additions > 0 ? <span className="text-success">+{file.additions}</span> : null}
					{file.additions > 0 && file.deletions > 0 ? ' ' : null}
					{file.deletions > 0 ? <span className="text-danger">−{file.deletions}</span> : null}
				</span>
			</button>
		</li>
	)
}
