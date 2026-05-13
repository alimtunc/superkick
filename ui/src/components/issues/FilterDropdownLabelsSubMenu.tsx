import { DEFAULT_LABEL_COLOR } from '@/lib/issueLabels'
import { Menu } from '@base-ui/react/menu'

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
			<div className="border-b border-border px-3 py-2">
				<input
					type="text"
					value={search}
					onChange={(e) => onSearchChange(e.target.value)}
					onKeyDown={(e) => e.stopPropagation()}
					placeholder="Filter..."
					className="w-full bg-transparent font-mono text-[12px] text-fg-muted outline-none placeholder:text-fg-dim"
				/>
			</div>
			<div className="max-h-64 overflow-y-auto py-1">
				{filtered.map((label) => {
					const color = labelColors.get(label) ?? DEFAULT_LABEL_COLOR
					const isActive = activeLabels.has(label)
					const count = labelCounts.get(label) ?? 0
					return (
						<Menu.Item
							key={label}
							onClick={() => onToggle(label)}
							closeOnClick={false}
							className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-raised ${
								isActive ? 'bg-raised' : ''
							}`}
						>
							<span
								className="inline-block size-2.5 shrink-0 rounded-full"
								style={{ backgroundColor: color }}
							/>
							<span className="flex-1 font-mono text-[12px] text-fg-muted">{label}</span>
							<span className="font-mono text-[11px] text-fg-dim">{count}</span>
						</Menu.Item>
					)
				})}
				{filtered.length === 0 ? (
					<p className="px-3 py-2 font-mono text-[11px] text-fg-dim">No labels found.</p>
				) : null}
			</div>
		</>
	)
}
