import { createIssueComment } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { IssueComment, IssueDetailResponse, ViewerResponse } from '@/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface UseCreateIssueCommentContext {
	previous: IssueDetailResponse | undefined
}

/** Optimistic append keyed by `temp:` id; onSuccess invalidates (cheaper than swapping in place). */
export function useCreateIssueComment(issueId: string, viewer: ViewerResponse | null) {
	const queryClient = useQueryClient()

	return useMutation<IssueComment, Error, string, UseCreateIssueCommentContext>({
		mutationFn: (body) => createIssueComment(issueId, body),
		onMutate: async (body) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.issues.detail(issueId) })
			const previous = queryClient.getQueryData<IssueDetailResponse>(queryKeys.issues.detail(issueId))
			if (previous) {
				const now = new Date().toISOString()
				const optimistic: IssueComment = {
					id: `temp:${crypto.randomUUID()}`,
					body,
					author: viewer
						? { id: viewer.id, name: viewer.name, avatar_url: viewer.avatar_url }
						: null,
					created_at: now,
					updated_at: now,
					parent_id: null
				}
				queryClient.setQueryData<IssueDetailResponse>(queryKeys.issues.detail(issueId), {
					...previous,
					comments: [...previous.comments, optimistic]
				})
			}
			return { previous }
		},
		onError: (err, _body, context) => {
			if (context?.previous) {
				queryClient.setQueryData(queryKeys.issues.detail(issueId), context.previous)
			}
			toast.error('Comment failed', { description: err.message })
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) })
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.search.all })
		}
	})
}
