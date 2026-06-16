import { Toggle } from '@/components/primitives'
import { useHiddenLaunchProfilesStore } from '@/stores/hiddenLaunchProfiles'

interface ProfileHideToggleProps {
	profileId: string
	profileName: string
}

export function ProfileHideToggle({ profileId, profileName }: ProfileHideToggleProps) {
	const hidden = useHiddenLaunchProfilesStore((s) => s.ids.includes(profileId))
	const setHidden = useHiddenLaunchProfilesStore((s) => s.setHidden)

	return (
		<Toggle
			checked={hidden}
			ariaLabel={`Hide ${profileName} from launcher`}
			onChange={(next) => setHidden(profileId, next)}
		/>
	)
}
