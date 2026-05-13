import { useState } from 'react'

import { FilterDropdownCategoryRow } from '@/components/issues/FilterDropdownCategoryRow'
import { FilterDropdownLabelsSubMenu } from '@/components/issues/FilterDropdownLabelsSubMenu'
import { FilterDropdownPrioritySubMenu } from '@/components/issues/FilterDropdownPrioritySubMenu'
import { FilterDropdownProjectSubMenu } from '@/components/issues/FilterDropdownProjectSubMenu'
import { PriorityIcon } from '@/components/issues/PriorityIcon'
import { Menu } from '@base-ui/react/menu'
import { Clock, Filter } from 'lucide-react'

type FilterCategory = null | 'priority' | 'labels' | 'project'

interface FilterDropdownProps {
	allLabels: string[]
	labelColors: Map<string, string>
	labelCounts: Map<string, number>
	activeLabels: Set<string>
	onToggleLabel: (label: string) => void
	allProjects: string[]
	activeProject: string | null
	onSelectProject: (project: string | null) => void
	activePriorities: Set<number>
	onTogglePriority: (priority: number) => void
	hasActiveFilters: boolean
}

export function FilterDropdown({
	allLabels,
	labelColors,
	labelCounts,
	activeLabels,
	onToggleLabel,
	allProjects,
	activeProject,
	onSelectProject,
	activePriorities,
	onTogglePriority,
	hasActiveFilters
}: FilterDropdownProps) {
	const [open, setOpen] = useState(false)
	const [activeCategory, setActiveCategory] = useState<FilterCategory>(null)
	const [labelSearch, setLabelSearch] = useState('')

	function handleOpenChange(nextOpen: boolean) {
		setOpen(nextOpen)
		if (!nextOpen) {
			setActiveCategory(null)
			setLabelSearch('')
		} else {
			setActiveCategory(null)
		}
	}

	return (
		<Menu.Root open={open} onOpenChange={handleOpenChange} modal={false}>
			<Menu.Trigger
				className={`inline-flex h-[26px] cursor-pointer items-center gap-[7px] rounded-[7px] border bg-transparent px-[10px] text-[12.5px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none ${
					hasActiveFilters || open
						? 'border-border-strong text-fg'
						: 'border-transparent text-fg-muted hover:bg-raised hover:text-fg'
				}`}
				title="Add filter"
				aria-label="Add filter"
			>
				<Filter size={14} strokeWidth={1.75} aria-hidden="true" />
				Filters
			</Menu.Trigger>

			<Menu.Portal>
				<Menu.Positioner sideOffset={4} align="end" className="z-50">
					<Menu.Popup className="flex items-start gap-1 bg-transparent outline-none">
						{activeCategory ? (
							<div className="w-56 rounded-lg border border-border bg-surface shadow-xl">
								{activeCategory === 'priority' ? (
									<FilterDropdownPrioritySubMenu
										activePriorities={activePriorities}
										onToggle={onTogglePriority}
									/>
								) : null}
								{activeCategory === 'labels' ? (
									<FilterDropdownLabelsSubMenu
										allLabels={allLabels}
										labelColors={labelColors}
										labelCounts={labelCounts}
										activeLabels={activeLabels}
										onToggle={onToggleLabel}
										search={labelSearch}
										onSearchChange={setLabelSearch}
									/>
								) : null}
								{activeCategory === 'project' ? (
									<FilterDropdownProjectSubMenu
										allProjects={allProjects}
										activeProject={activeProject}
										onSelect={onSelectProject}
									/>
								) : null}
							</div>
						) : null}

						<div className="w-48 rounded-lg border border-border bg-surface shadow-xl">
							<div className="border-b border-border px-3 py-2">
								<span className="font-mono text-[12px] text-fg-dim">Add Filter&hellip;</span>
							</div>
							<div className="py-1">
								<FilterDropdownCategoryRow
									icon={<PriorityIcon value={2} />}
									label="Priority"
									active={activeCategory === 'priority'}
									hasValue={activePriorities.size > 0}
									onClick={() =>
										setActiveCategory((category) =>
											category === 'priority' ? null : 'priority'
										)
									}
								/>
								<FilterDropdownCategoryRow
									icon={
										<span className="flex size-3.5 items-center justify-center rounded border border-fg-dim">
											<span className="inline-block size-1.5 rounded-full bg-fg-dim" />
										</span>
									}
									label="Labels"
									active={activeCategory === 'labels'}
									hasValue={activeLabels.size > 0}
									onClick={() => {
										setActiveCategory((category) =>
											category === 'labels' ? null : 'labels'
										)
										setLabelSearch('')
									}}
								/>
								<FilterDropdownCategoryRow
									icon={<Clock size={14} strokeWidth={1.75} className="text-fg-dim" />}
									label="Project"
									active={activeCategory === 'project'}
									hasValue={activeProject !== null}
									onClick={() =>
										setActiveCategory((category) =>
											category === 'project' ? null : 'project'
										)
									}
								/>
							</div>
						</div>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	)
}
