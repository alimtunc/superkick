import { updateLaunchProfileSettings } from '@/api'
import { errorMessageOr } from '@/lib/errors'
import { queryKeys } from '@/lib/queryKeys'
import type { ServerConfigResponse } from '@/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function useAutoTransitionToggle() {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (next: boolean) => updateLaunchProfileSettings({ auto_transition_in_progress: next }),
		onSuccess: (launchProfile) => {
			queryClient.setQueryData<ServerConfigResponse>(queryKeys.config.all, (current) =>
				current ? { ...current, launch_profile: launchProfile } : current
			)
			toast.success('Saved')
		},
		onError: (error) => {
			toast.error(errorMessageOr(error, 'Failed to save setting'))
		}
	})
}
