import { patchIssue } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { IssueDetailResponse, IssueUpdateRequest } from '@/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface UseUpdateIssueVariables {
	patch: IssueUpdateRequest
	/** Caller-owned merge — each row knows which display object to splice in. */
	optimistic: (previous: IssueDetailResponse) => IssueDetailResponse
}

interface UseUpdateIssueContext {
	previous: IssueDetailResponse | undefined
}

/** PATCH returns the hydrated detail, so onSuccess primes the cache instead of refetching. */
export function useUpdateIssue(issueId: string) {
	const queryClient = useQueryClient()

	return useMutation<IssueDetailResponse, Error, UseUpdateIssueVariables, UseUpdateIssueContext>({
		mutationFn: ({ patch }) => patchIssue(issueId, patch),
		onMutate: async ({ optimistic }) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.issues.detail(issueId) })
			const previous = queryClient.getQueryData<IssueDetailResponse>(queryKeys.issues.detail(issueId))
			if (previous) {
				queryClient.setQueryData<IssueDetailResponse>(
					queryKeys.issues.detail(issueId),
					optimistic(previous)
				)
			}
			return { previous }
		},
		onError: (err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(queryKeys.issues.detail(issueId), context.previous)
			}
			toast.error('Update failed', { description: err.message })
		},
		onSuccess: (response) => {
			queryClient.setQueryData(queryKeys.issues.detail(issueId), response)
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.issues.all })
			queryClient.invalidateQueries({ queryKey: queryKeys.launchQueue.all })
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.queue })
			queryClient.invalidateQueries({ queryKey: queryKeys.search.all })
		}
	})
}
