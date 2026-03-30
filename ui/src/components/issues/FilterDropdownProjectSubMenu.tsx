export function FilterDropdownProjectSubMenu({
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
