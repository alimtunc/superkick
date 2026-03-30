export function FilterDropdownLabelsSubMenu({
	allLabels,
	labelColors,
	labelCounts,
	activeLabels,
	onToggle,
	search,
	onSearchChange
}: {
	allLabels: string[]
	labelColors: Map<string, string>
	labelCounts: Map<string, number>
	activeLabels: Set<string>
	onToggle: (label: string) => void
	search: string
	onSearchChange: (v: string) => void
}) {
	const filtered = search
		? allLabels.filter((l) => l.toLowerCase().includes(search.toLowerCase()))
		: allLabels

	return (
		<>
			<div className="border-b border-edge px-3 py-2">
				<input
					type="text"
					value={search}
					onChange={(e) => onSearchChange(e.target.value)}
					placeholder="Filter..."
					autoFocus
					className="font-data w-full bg-transparent text-[12px] text-silver outline-none placeholder:text-dim"
				/>
			</div>
			<div className="max-h-64 overflow-y-auto py-1">
				{filtered.map((label) => {
					const color = labelColors.get(label) ?? '#6b7280'
					const isActive = activeLabels.has(label)
					const count = labelCounts.get(label) ?? 0
					return (
						<button
							key={label}
							type="button"
							onClick={() => onToggle(label)}
							className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-white/5 ${
								isActive ? 'bg-white/3' : ''
							}`}
						>
							<span
								className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
								style={{ backgroundColor: color }}
							/>
							<span className="font-data flex-1 text-[12px] text-silver">{label}</span>
							<span className="font-data text-[11px] text-dim">{count}</span>
						</button>
					)
				})}
				{filtered.length === 0 ? (
					<p className="font-data px-3 py-2 text-[11px] text-dim">No labels found.</p>
				) : null}
			</div>
		</>
	)
}
