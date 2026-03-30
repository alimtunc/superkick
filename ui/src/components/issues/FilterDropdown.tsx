import { useState } from 'react'

import { FilterDropdownCategoryRow } from '@/components/issues/FilterDropdownCategoryRow'
import { FilterDropdownLabelsSubMenu } from '@/components/issues/FilterDropdownLabelsSubMenu'
import { FilterDropdownPrioritySubMenu } from '@/components/issues/FilterDropdownPrioritySubMenu'
import { FilterDropdownProjectSubMenu } from '@/components/issues/FilterDropdownProjectSubMenu'
import { PriorityIcon } from '@/components/issues/PriorityIcon'
import { Filter } from 'lucide-react'

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

	function handleClose() {
		setOpen(false)
		setActiveCategory(null)
		setLabelSearch('')
	}

	function handleToggle() {
		if (open) {
			handleClose()
		} else {
			setOpen(true)
			setActiveCategory(null)
		}
	}

	return (
		<div className="relative">
			<button
				type="button"
				onClick={handleToggle}
				className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border transition-colors ${
					hasActiveFilters || open
						? 'border-edge-bright text-silver'
						: 'border-edge text-dim hover:border-edge-bright hover:text-silver'
				}`}
				title="Add filter"
			>
				<Filter size={14} />
			</button>

			{open ? (
				<>
					<div className="absolute top-full right-0 z-50 mt-1 flex">
						{activeCategory ? (
							<div className="mr-1 w-56 rounded-lg border border-edge bg-carbon shadow-xl">
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
										onSelect={(value) => {
											onSelectProject(value)
											handleClose()
										}}
									/>
								) : null}
							</div>
						) : null}

						<div className="w-48 rounded-lg border border-edge bg-carbon shadow-xl">
							<div className="border-b border-edge px-3 py-2">
								<span className="font-data text-[12px] text-dim">Add Filter...</span>
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
										<span className="flex h-3.5 w-3.5 items-center justify-center rounded border border-dim">
											<span className="inline-block h-1.5 w-1.5 rounded-full bg-dim" />
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
									icon={
										<svg
											width="14"
											height="14"
											viewBox="0 0 16 16"
											fill="none"
											className="text-dim"
										>
											<circle
												cx="8"
												cy="8"
												r="6"
												stroke="currentColor"
												strokeWidth="1.2"
											/>
											<path
												d="M8 4v4l3 2"
												stroke="currentColor"
												strokeWidth="1.2"
												strokeLinecap="round"
											/>
										</svg>
									}
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
					</div>

					<div className="fixed inset-0 z-40" onClick={handleClose} aria-hidden="true" />
				</>
			) : null}
		</div>
	)
}
