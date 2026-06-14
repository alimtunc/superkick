import { useEffect } from 'react'

import { MenuPopup } from '@/components/ui/menu-shell'
import { useLaunchProfiles } from '@/hooks/useLaunchProfiles'
import { cn } from '@/lib/utils'
import { useHiddenLaunchProfilesStore } from '@/stores/hiddenLaunchProfiles'
import { useLaunchComposerState } from '@/stores/launchComposerState'
import { Icon } from '@/ui/Icon'
import { Menu } from '@base-ui/react/menu'

export function LaunchProfilePicker() {
	const { profiles } = useLaunchProfiles()
	const profileId = useLaunchComposerState((state) => state.profileId)
	const selectProfile = useLaunchComposerState((state) => state.selectProfile)
	const hiddenIds = useHiddenLaunchProfilesStore((state) => state.ids)

	const visibleProfiles = profiles.filter(
		(profile) => !hiddenIds.includes(profile.id) || profile.id === profileId
	)

	useEffect(() => {
		if (profileId !== null) return
		const fallback = profiles.find((profile) => !hiddenIds.includes(profile.id))
		if (fallback) selectProfile(fallback)
	}, [profileId, profiles, hiddenIds, selectProfile])

	const currentLabel = profiles.find((profile) => profile.id === profileId)?.name ?? 'Profile'

	return (
		<Menu.Root>
			<Menu.Trigger aria-label={`Launch profile: ${currentLabel}`} className="select">
				<span className="text-fg-dim">Profile</span>
				<span className="font-medium text-fg">{currentLabel}</span>
				<span className="chev">
					<Icon name="chevDown" size={14} className="ic" />
				</span>
			</Menu.Trigger>
			<MenuPopup align="start" popupClassName="w-56">
				<Menu.RadioGroup
					value={profileId ?? ''}
					onValueChange={(next) =>
						selectProfile(profiles.find((profile) => profile.id === next) ?? null)
					}
				>
					{visibleProfiles.map((profile) => (
						<Menu.RadioItem
							key={profile.id}
							value={profile.id}
							className={cn(
								'flex cursor-pointer items-center gap-2 px-3 py-2 text-[12.5px] outline-none',
								'data-highlighted:bg-raised data-checked:bg-raised'
							)}
						>
							<span className="flex-1 text-fg">{profile.name}</span>
							<Menu.RadioItemIndicator className="text-fg">
								<Icon name="check" size={13} />
							</Menu.RadioItemIndicator>
						</Menu.RadioItem>
					))}
				</Menu.RadioGroup>
			</MenuPopup>
		</Menu.Root>
	)
}
