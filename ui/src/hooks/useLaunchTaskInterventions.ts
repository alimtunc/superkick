import { createLaunchTaskIntervention } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { CreateInterventionRequest, LaunchTaskIntervention } from '@/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface UseCreateInterventionParams {
	linearIssueId: string
	taskId: string
}

export function useCreateLaunchTaskIntervention(params: UseCreateInterventionParams) {
	const queryClient = useQueryClient()
	return useMutation<LaunchTaskIntervention, Error, CreateInterventionRequest>({
		mutationFn: (req) => createLaunchTaskIntervention(params.taskId, req),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.launchTasks.interventions(params.taskId)
			})
			queryClient.invalidateQueries({
				queryKey: queryKeys.launchTasks.forIssue(params.linearIssueId)
			})
		},
		onError: (err) => toast.error('Send intervention failed', { description: err.message })
	})
}
