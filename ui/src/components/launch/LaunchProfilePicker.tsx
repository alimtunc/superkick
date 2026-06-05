import { useLaunchProfiles } from '@/hooks/useLaunchProfiles'
import { useLaunchComposerState } from '@/stores/launchComposerState'

export function LaunchProfilePicker() {
	const { profiles } = useLaunchProfiles()
	const profileId = useLaunchComposerState((state) => state.profileId)
	const selectProfile = useLaunchComposerState((state) => state.selectProfile)

	return (
		<label className="inline-flex items-center gap-1.5 text-[12px] text-fg-dim">
			<span>Profile</span>
			<select
				aria-label="Launch profile"
				className="rounded-[6px] border border-border bg-raised px-2 py-1 text-[13px] text-fg"
				value={profileId ?? ''}
				onChange={(event) =>
					selectProfile(profiles.find((profile) => profile.id === event.target.value) ?? null)
				}
			>
				<option value="">Agents (legacy)</option>
				{profiles.map((profile) => (
					<option key={profile.id} value={profile.id}>
						{profile.name}
					</option>
				))}
			</select>
		</label>
	)
}
