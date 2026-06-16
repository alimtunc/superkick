interface DiffPreviewProps {
	path: string
	added: number
	removed: number
	body?: string
}

export function DiffPreview({ path, added, removed, body }: DiffPreviewProps) {
	return (
		<div className="overflow-hidden rounded-md border border-border bg-canvas">
			<div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
				<span className="font-data truncate text-[12px] text-fg">{path}</span>
				<span className="font-data shrink-0 text-[11px]">
					<span className="text-success">+{added}</span>
					<span className="mx-1 text-fg-dim">·</span>
					<span className="text-danger">-{removed}</span>
				</span>
			</div>
			{body ? (
				<pre className="overflow-x-auto bg-canvas px-3 py-2 font-mono text-[11.5px] leading-relaxed text-fg-muted">
					{body}
				</pre>
			) : null}
		</div>
	)
}
