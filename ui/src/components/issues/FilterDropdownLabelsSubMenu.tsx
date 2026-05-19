import { useState } from 'react'

import { FilterDropdownCategoryRow } from '@/components/issues/FilterDropdownCategoryRow'
import { MenuPopup } from '@/components/ui/menu-shell'
import { DEFAULT_LABEL_COLOR } from '@/lib/issueLabels'
import { Menu } from '@base-ui/react/menu'

interface FilterDropdownLabelsSubMenuProps {
	allLabels: string[]
	labelColors: Map<string, string>
	labelCounts: Map<string, number>
	activeLabels: Set<string>
	onToggle: (label: string) => void
}

export function FilterDropdownLabelsSubMenu({
	allLabels,
	labelColors,
	labelCounts,
	activeLabels,
	onToggle
}: FilterDropdownLabelsSubMenuProps) {
	const [search, setSearch] = useState('')
	const filtered = search
		? allLabels.filter((l) => l.toLowerCase().includes(search.toLowerCase()))
		: allLabels

	return (
		<Menu.SubmenuRoot onOpenChange={(open) => (open ? null : setSearch(''))}>
			<Menu.SubmenuTrigger
				openOnHover={false}
				render={
					<FilterDropdownCategoryRow
						icon={
							<span className="flex size-3.5 items-center justify-center rounded border border-fg-dim">
								<span className="inline-block size-1.5 rounded-full bg-fg-dim" />
							</span>
						}
						label="Labels"
						hasValue={activeLabels.size > 0}
					/>
				}
			/>
			<MenuPopup align="start" popupClassName="w-56">
				<div className="border-b border-border px-3 py-2">
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Filter…"
						className="w-full bg-transparent font-mono text-[12px] text-fg-muted outline-none placeholder:text-fg-dim"
						aria-label="Filter labels"
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
			</MenuPopup>
		</Menu.SubmenuRoot>
	)
}
