import { createLaunchProfile, deleteLaunchProfile, updateLaunchProfile } from '@/api'
import { useCrudResource } from '@/hooks/useCrudResource'
import { launchProfilesQuery } from '@/lib/queries'
import { queryKeys } from '@/lib/queryKeys'
import type { LaunchProfile } from '@/types'

export function useLaunchProfiles() {
	const crud = useCrudResource({
		query: launchProfilesQuery(),
		invalidateKey: queryKeys.launchProfiles.all,
		create: createLaunchProfile,
		update: updateLaunchProfile,
		remove: deleteLaunchProfile
	})

	return {
		profiles: crud.entities,
		isLoading: crud.isLoading,
		error: crud.error,
		createProfile: crud.createEntity,
		updateProfile: (vars: { id: string; profile: LaunchProfile }) =>
			crud.updateEntity({ id: vars.id, entity: vars.profile }),
		deleteProfile: crud.deleteEntity,
		isMutating: crud.isMutating
	}
}
