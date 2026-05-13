const HEADER_CLASS = 'font-mono text-[10.5px] font-semibold tracking-[0.8px] text-fg-dim uppercase'

export function IssuesListColumnHeader() {
	return (
		<div
			className={`sticky top-0 z-10 flex h-8 items-center gap-3 border-b border-border bg-surface ${HEADER_CLASS}`}
		>
			<span className="w-6 shrink-0" aria-hidden="true" />
			<span className="w-14">id</span>
			<span className="w-8 text-center">sev</span>
			<span className="flex-1">title</span>
			<span className="w-27.5">status</span>
			<span className="w-32.5">repo</span>
			<span className="w-27.5">agent</span>
			<span className="w-14 pr-6 text-right">age</span>
		</div>
	)
}
