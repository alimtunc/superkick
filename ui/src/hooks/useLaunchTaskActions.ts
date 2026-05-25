import { cancelLaunchTask, retryLaunchTask } from '@/api'
import { invalidateAfterRunOrTaskStateChange } from '@/lib/queryInvalidation'
import type { CancelLaunchTaskResponse, RetryLaunchTaskResponse } from '@/types'
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface UseLaunchTaskActionParams {
	linearIssueId: string
	taskId: string
	linkedRunId?: string
}

function invalidateLaunchTaskCaches(
	queryClient: QueryClient,
	{ linearIssueId, taskId, linkedRunId }: UseLaunchTaskActionParams
) {
	invalidateAfterRunOrTaskStateChange(queryClient, {
		issueId: linearIssueId,
		taskId,
		runId: linkedRunId
	})
}

export function useCancelLaunchTask(params: UseLaunchTaskActionParams) {
	const queryClient = useQueryClient()
	return useMutation<CancelLaunchTaskResponse, Error, void>({
		mutationFn: () => cancelLaunchTask(params.taskId),
		onSuccess: () => invalidateLaunchTaskCaches(queryClient, params),
		onError: (err) => toast.error('Cancel failed', { description: err.message })
	})
}

export function useRetryLaunchTask(params: UseLaunchTaskActionParams) {
	const queryClient = useQueryClient()
	return useMutation<RetryLaunchTaskResponse, Error, void>({
		mutationFn: () => retryLaunchTask(params.taskId),
		onSuccess: () => invalidateLaunchTaskCaches(queryClient, params),
		onError: (err) => toast.error('Retry failed', { description: err.message })
	})
}
