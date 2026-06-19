import { cleanIssue } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { CleanIssueMode, CleanIssueResponse } from '@/types/cleanIssue'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface UseCleanIssueOptions {
	issueIdentifier: string
	issueId?: string
	onSuccess?: (result: CleanIssueResponse) => void
}

export function useCleanIssue({ issueIdentifier, issueId, onSuccess }: UseCleanIssueOptions) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: (mode: CleanIssueMode) => cleanIssue(issueIdentifier, mode),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.launchTasks.forIssue(issueIdentifier) })
			queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
			if (issueId) {
				queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) })
			}
			onSuccess?.(result)
		}
	})
}
