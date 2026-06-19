import { MENU_ITEM_CLASS, MenuPopup } from '@/components/composites/menu-shell'
import { Icon } from '@/components/primitives'
import { SkillChip } from '@/domains/agents/components/SkillChip'
import { useSkills } from '@/hooks/useSkills'
import { skillLabel } from '@/lib/agents'
import { cn } from '@/lib/utils'
import { Menu } from '@base-ui/react/menu'

interface SkillPickerProps {
	value: string[]
	onChange: (next: string[]) => void
}

/** Multi-select for the skills attached to an agent. Reads the workspace skill
 *  catalog and renders attached skills as removable chips. */
export function SkillPicker({ value, onChange }: SkillPickerProps) {
	const { skills } = useSkills()
	// Disabled skills are not offered for attachment (mirrors the launch picker).
	const available = skills.filter((skill) => !value.includes(skill.id) && skill.enabled)

	function add(id: string) {
		onChange([...value, id])
	}

	function remove(id: string) {
		onChange(value.filter((entry) => entry !== id))
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-1.5">
				{value.length === 0 ? (
					<span className="text-[12px] text-fg-dim">No skills attached</span>
				) : (
					value.map((id) => (
						<SkillChip key={id} label={skillLabel(skills, id)} onRemove={() => remove(id)} />
					))
				)}
			</div>
			<Menu.Root>
				<Menu.Trigger
					disabled={available.length === 0}
					aria-label="Add skill from workspace"
					className={cn('select self-start', available.length === 0 && 'opacity-50')}
				>
					<Icon name="plus" size={14} className="ic text-fg-muted" />
					<span className="text-fg-dim">Add skill</span>
					<span className="chev">
						<Icon name="chevDown" size={14} className="ic" />
					</span>
				</Menu.Trigger>
				<MenuPopup align="start" popupClassName="w-64">
					{available.map((skill) => (
						<Menu.Item key={skill.id} className={MENU_ITEM_CLASS} onClick={() => add(skill.id)}>
							{skill.label}
						</Menu.Item>
					))}
				</MenuPopup>
			</Menu.Root>
		</div>
	)
}
