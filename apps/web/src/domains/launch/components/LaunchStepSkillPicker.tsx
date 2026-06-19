import { MenuSelect } from '@/components/composites/menu-select'
import type { SkillDefinition } from '@/types'

interface LaunchStepSkillPickerProps {
	skillRef: string
	skills: SkillDefinition[]
	ariaLabel: string
	disabled?: boolean
	onSelect: (skill: SkillDefinition) => void
}

export function LaunchStepSkillPicker({
	skillRef,
	skills,
	ariaLabel,
	disabled,
	onSelect
}: LaunchStepSkillPickerProps) {
	const enabledSkills = skills.filter((skill) => skill.enabled)
	const options = enabledSkills.map((skill) => skill.id)
	const labels = Object.fromEntries(enabledSkills.map((skill) => [skill.id, skill.label]))
	if (!labels[skillRef]) {
		options.unshift(skillRef)
		labels[skillRef] = skillRef
	}

	return (
		<MenuSelect
			ariaLabel={ariaLabel}
			value={skillRef}
			options={options}
			labels={labels}
			disabled={disabled}
			onChange={(id) => {
				const skill = enabledSkills.find((candidate) => candidate.id === id)
				if (skill) onSelect(skill)
			}}
		/>
	)
}
