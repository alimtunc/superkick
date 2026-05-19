import { FilterDropdownLabelsSubMenu } from '@/components/issues/FilterDropdownLabelsSubMenu'
import { FilterDropdownPrioritySubMenu } from '@/components/issues/FilterDropdownPrioritySubMenu'
import { FilterDropdownProjectSubMenu } from '@/components/issues/FilterDropdownProjectSubMenu'
import { MenuPopup } from '@/components/ui/menu-shell'
import { Menu } from '@base-ui/react/menu'
import { Filter } from 'lucide-react'

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
	return (
		<Menu.Root modal={false}>
			<Menu.Trigger
				className={`inline-flex h-[26px] cursor-pointer items-center gap-[7px] rounded-[7px] border bg-transparent px-[10px] text-[12.5px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none data-popup-open:border-border-strong data-popup-open:text-fg ${
					hasActiveFilters
						? 'border-border-strong text-fg'
						: 'border-transparent text-fg-muted hover:bg-raised hover:text-fg'
				}`}
				title="Add filter"
				aria-label="Add filter"
				data-has-filters={hasActiveFilters || undefined}
			>
				<Filter size={14} strokeWidth={1.75} aria-hidden="true" />
				Filters
			</Menu.Trigger>

			<MenuPopup align="end" sideOffset={4} popupClassName="w-48">
				<div className="border-b border-border px-3 py-2">
					<span className="font-mono text-[12px] text-fg-dim">Add Filter&hellip;</span>
				</div>
				<div className="py-1">
					<FilterDropdownPrioritySubMenu
						activePriorities={activePriorities}
						onToggle={onTogglePriority}
					/>
					<FilterDropdownLabelsSubMenu
						allLabels={allLabels}
						labelColors={labelColors}
						labelCounts={labelCounts}
						activeLabels={activeLabels}
						onToggle={onToggleLabel}
					/>
					<FilterDropdownProjectSubMenu
						allProjects={allProjects}
						activeProject={activeProject}
						onSelect={onSelectProject}
					/>
				</div>
			</MenuPopup>
		</Menu.Root>
	)
}
