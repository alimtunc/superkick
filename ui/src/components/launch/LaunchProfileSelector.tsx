import { MenuSelect } from '@/components/ui/menu-select'
import type { LaunchProfile } from '@/types'

interface LaunchProfileSelectorProps {
	profiles: LaunchProfile[]
	selectedId: string | null
	onSelect: (profile: LaunchProfile) => void
}

export function LaunchProfileSelector({ profiles, selectedId, onSelect }: LaunchProfileSelectorProps) {
	const options = profiles.map((profile) => profile.id)
	const labels = Object.fromEntries(profiles.map((profile) => [profile.id, profile.name]))
	const value = selectedId ?? options[0] ?? ''

	return (
		<MenuSelect
			ariaLabel="Launch profile"
			value={value}
			options={options}
			labels={labels}
			onChange={(id) => {
				const profile = profiles.find((candidate) => candidate.id === id)
				if (profile) onSelect(profile)
			}}
		/>
	)
}
