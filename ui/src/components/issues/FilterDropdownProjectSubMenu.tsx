import { Menu } from '@base-ui/react/menu'
import { Clock } from 'lucide-react'

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
					<Menu.Item
						key={project}
						onClick={() => onSelect(isActive ? null : project)}
						className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-white/5 ${
							isActive ? 'bg-white/3' : ''
						}`}
					>
						<Clock size={14} strokeWidth={1.75} className="text-dim" aria-hidden="true" />
						<span className="font-data flex-1 text-[12px] text-silver">{project}</span>
					</Menu.Item>
				)
			})}
		</div>
	)
}
