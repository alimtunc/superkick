import { createLaunchTask } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { CreateLaunchTaskRequest, LaunchTaskWithSteps } from '@/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface UseCreateLaunchTaskOptions {
	issueId?: string
	onSuccess?: (result: LaunchTaskWithSteps) => void
}

/**
 * SUP-117 — create a Launch Task and refresh the per-issue task list so the
 * Issue Detail panel can flip from launcher to active-task view immediately.
 */
export function useCreateLaunchTask({ issueId, onSuccess }: UseCreateLaunchTaskOptions = {}) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (req: CreateLaunchTaskRequest) => createLaunchTask(req),
		onSuccess: (result) => {
			if (issueId) {
				queryClient.invalidateQueries({ queryKey: queryKeys.launchTasks.forIssue(issueId) })
				queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) })
			}
			onSuccess?.(result)
		}
	})
}
