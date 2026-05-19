import { FilterDropdownCategoryRow } from '@/components/issues/FilterDropdownCategoryRow'
import { MenuPopup } from '@/components/ui/menu-shell'
import { Menu } from '@base-ui/react/menu'
import { Clock } from 'lucide-react'

interface FilterDropdownProjectSubMenuProps {
	allProjects: string[]
	activeProject: string | null
	onSelect: (v: string | null) => void
}

export function FilterDropdownProjectSubMenu({
	allProjects,
	activeProject,
	onSelect
}: FilterDropdownProjectSubMenuProps) {
	return (
		<Menu.SubmenuRoot>
			<Menu.SubmenuTrigger
				openOnHover={false}
				render={
					<FilterDropdownCategoryRow
						icon={<Clock size={14} strokeWidth={1.75} className="text-fg-dim" />}
						label="Project"
						hasValue={activeProject !== null}
					/>
				}
			/>
			<MenuPopup align="start" popupClassName="w-56">
				<div className="py-1">
					{allProjects.map((project) => {
						const isActive = project === activeProject
						return (
							<Menu.Item
								key={project}
								onClick={() => onSelect(isActive ? null : project)}
								className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-raised ${
									isActive ? 'bg-raised' : ''
								}`}
							>
								<Clock
									size={14}
									strokeWidth={1.75}
									className="text-fg-dim"
									aria-hidden="true"
								/>
								<span className="flex-1 font-mono text-[12px] text-fg-muted">{project}</span>
							</Menu.Item>
						)
					})}
				</div>
			</MenuPopup>
		</Menu.SubmenuRoot>
	)
}
