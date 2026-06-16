import { createIssue } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { IssueCreateRequest, IssueDetailResponse } from '@/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/** Server-first: the caller needs the real `identifier` for the navigation target. */
export function useCreateIssue() {
	const queryClient = useQueryClient()

	return useMutation<IssueDetailResponse, Error, IssueCreateRequest>({
		mutationFn: (body) => createIssue(body),
		onError: (err) => {
			toast.error('Create failed', { description: err.message })
		},
		onSuccess: (response) => {
			queryClient.setQueryData(queryKeys.issues.detail(response.id), response)
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.issues.all })
			queryClient.invalidateQueries({ queryKey: queryKeys.launchQueue.all })
			queryClient.invalidateQueries({ queryKey: queryKeys.search.all })
		}
	})
}
