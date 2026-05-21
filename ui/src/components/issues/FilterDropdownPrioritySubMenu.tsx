import { FilterDropdownCategoryRow } from '@/components/issues/FilterDropdownCategoryRow'
import { MenuPopup } from '@/components/ui/menu-shell'
import { PriorityIcon, priorityIconKindFromValue } from '@/ui'
import { Menu } from '@base-ui/react/menu'

interface FilterDropdownPrioritySubMenuProps {
	activePriorities: Set<number>
	onToggle: (v: number) => void
}

const PRIORITIES = [
	{ value: 1, label: 'Urgent' },
	{ value: 2, label: 'High' },
	{ value: 3, label: 'Medium' },
	{ value: 4, label: 'Low' },
	{ value: 0, label: 'None' }
]

export function FilterDropdownPrioritySubMenu({
	activePriorities,
	onToggle
}: FilterDropdownPrioritySubMenuProps) {
	return (
		<Menu.SubmenuRoot>
			<Menu.SubmenuTrigger
				openOnHover={false}
				render={
					<FilterDropdownCategoryRow
						icon={<PriorityIcon kind={priorityIconKindFromValue(2)} />}
						label="Priority"
						hasValue={activePriorities.size > 0}
					/>
				}
			/>
			<MenuPopup align="start" popupClassName="w-56">
				<div className="py-1">
					{PRIORITIES.map(({ value, label }) => {
						const isActive = activePriorities.has(value)
						return (
							<Menu.Item
								key={value}
								onClick={() => onToggle(value)}
								closeOnClick={false}
								className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-raised ${
									isActive ? 'bg-raised' : ''
								}`}
							>
								<PriorityIcon kind={priorityIconKindFromValue(value)} />
								<span className="flex-1 font-mono text-[12px] text-fg-muted">{label}</span>
							</Menu.Item>
						)
					})}
				</div>
			</MenuPopup>
		</Menu.SubmenuRoot>
	)
}
