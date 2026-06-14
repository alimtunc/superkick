import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface HiddenLaunchProfilesState {
	ids: string[]
}

interface HiddenLaunchProfilesActions {
	setHidden: (profileId: string, hidden: boolean) => void
}

export type HiddenLaunchProfilesStore = HiddenLaunchProfilesState & HiddenLaunchProfilesActions

export const useHiddenLaunchProfilesStore = create<HiddenLaunchProfilesStore>()(
	persist(
		(set) => ({
			ids: [],

			setHidden: (profileId: string, hidden: boolean) =>
				set((s) => {
					const present = s.ids.includes(profileId)
					if (hidden === present) return s
					return {
						ids: hidden ? [...s.ids, profileId] : s.ids.filter((id) => id !== profileId)
					}
				})
		}),
		{ name: 'superkick:hidden-launch-profiles' }
	)
)
