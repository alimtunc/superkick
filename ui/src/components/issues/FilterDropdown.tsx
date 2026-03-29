import { type ReactNode, useState } from 'react'

import { PriorityIcon } from '@/components/issues/PriorityIcon'
import { Filter } from 'lucide-react'

type FilterCategory = null | 'priority' | 'labels' | 'project'

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
}: {
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
}) {
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
						{/* Sub-panel (shows when a category is selected) */}
						{activeCategory ? (
							<div className="mr-1 w-56 rounded-lg border border-edge bg-carbon shadow-xl">
								{activeCategory === 'priority' ? (
									<PrioritySubMenu
										activePriorities={activePriorities}
										onToggle={onTogglePriority}
									/>
								) : null}
								{activeCategory === 'labels' ? (
									<LabelsSubMenu
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
									<ProjectSubMenu
										allProjects={allProjects}
										activeProject={activeProject}
										onSelect={(v) => {
											onSelectProject(v)
											handleClose()
										}}
									/>
								) : null}
							</div>
						) : null}

						{/* Main category list */}
						<div className="w-48 rounded-lg border border-edge bg-carbon shadow-xl">
							<div className="border-b border-edge px-3 py-2">
								<span className="font-data text-[12px] text-dim">Add Filter...</span>
							</div>
							<div className="py-1">
								<CategoryRow
									icon={<PriorityIcon value={2} />}
									label="Priority"
									active={activeCategory === 'priority'}
									hasValue={activePriorities.size > 0}
									onClick={() =>
										setActiveCategory((c) => (c === 'priority' ? null : 'priority'))
									}
								/>
								<CategoryRow
									icon={
										<span className="flex h-3.5 w-3.5 items-center justify-center rounded border border-dim">
											<span className="inline-block h-1.5 w-1.5 rounded-full bg-dim" />
										</span>
									}
									label="Labels"
									active={activeCategory === 'labels'}
									hasValue={activeLabels.size > 0}
									onClick={() => {
										setActiveCategory((c) => (c === 'labels' ? null : 'labels'))
										setLabelSearch('')
									}}
								/>
								<CategoryRow
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
										setActiveCategory((c) => (c === 'project' ? null : 'project'))
									}
								/>
							</div>
						</div>
					</div>

					{/* Backdrop */}
					<div className="fixed inset-0 z-40" onClick={handleClose} aria-hidden="true" />
				</>
			) : null}
		</div>
	)
}

function CategoryRow({
	icon,
	label,
	active,
	hasValue,
	onClick
}: {
	icon: ReactNode
	label: string
	active: boolean
	hasValue: boolean
	onClick: () => void
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-white/5 ${
				active ? 'bg-white/5' : ''
			}`}
		>
			<span className="flex w-4 shrink-0 items-center justify-center">{icon}</span>
			<span className="font-data flex-1 text-[12px] text-silver">{label}</span>
			{hasValue ? <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" /> : null}
			<span className="text-[10px] text-dim">&rsaquo;</span>
		</button>
	)
}

function PrioritySubMenu({
	activePriorities,
	onToggle
}: {
	activePriorities: Set<number>
	onToggle: (v: number) => void
}) {
	const priorities = [
		{ value: 1, label: 'Urgent' },
		{ value: 2, label: 'High' },
		{ value: 3, label: 'Medium' },
		{ value: 4, label: 'Low' },
		{ value: 0, label: 'None' }
	]

	return (
		<div className="py-1">
			{priorities.map(({ value, label }) => {
				const isActive = activePriorities.has(value)
				return (
					<button
						key={value}
						type="button"
						onClick={() => onToggle(value)}
						className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-white/5 ${
							isActive ? 'bg-white/3' : ''
						}`}
					>
						<PriorityIcon value={value} />
						<span className="font-data flex-1 text-[12px] text-silver">{label}</span>
					</button>
				)
			})}
		</div>
	)
}

function LabelsSubMenu({
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

function ProjectSubMenu({
	allProjects,
	activeProject,
	onSelect
}: {
	allProjects: string[]
	activeProject: string | null
	onSelect: (v: string | null) => void
}) {
	return (
		<div className="py-1">
			{allProjects.map((project) => {
				const isActive = project === activeProject
				return (
					<button
						key={project}
						type="button"
						onClick={() => onSelect(isActive ? null : project)}
						className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-white/5 ${
							isActive ? 'bg-white/3' : ''
						}`}
					>
						<svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-dim">
							<circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" />
							<path
								d="M8 4v4l3 2"
								stroke="currentColor"
								strokeWidth="1.2"
								strokeLinecap="round"
							/>
						</svg>
						<span className="font-data flex-1 text-[12px] text-silver">{project}</span>
					</button>
				)
			})}
		</div>
	)
}
