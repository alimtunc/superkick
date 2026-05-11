import { createLaunchTask } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { CreateLaunchTaskRequest, LaunchTaskWithSteps } from '@/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface UseCreateLaunchTaskOptions {
	/** Linear identifier (e.g. `SUP-122`) — keyspace for `useIssueLaunchTasks`. */
	issueIdentifier: string
	/** Linear UUID — keyspace for `issueDetailQuery`. Optional: only set when called from the issue-detail panel. */
	issueId?: string
	onSuccess?: (result: LaunchTaskWithSteps) => void
}

/**
 * SUP-117 — create a Launch Task and refresh the per-issue task list so the
 * Issue Detail panel can flip from launcher to active-task view immediately.
 * The two invalidations use different keyspaces: the issue detail query is
 * keyed by Linear UUID while the launch-task list is keyed by identifier.
 */
export function useCreateLaunchTask({ issueIdentifier, issueId, onSuccess }: UseCreateLaunchTaskOptions) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (req: CreateLaunchTaskRequest) => createLaunchTask(req),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.launchTasks.forIssue(issueIdentifier) })
			if (issueId) {
				queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) })
			}
			onSuccess?.(result)
		}
	})
}
