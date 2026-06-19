import { useCallback } from 'react'

import { DuplicateRunError, dispatchFromQueue } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { DispatchFromQueueRequest, Run } from '@/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface DispatchMutationVariables {
	issueIdentifier: string
	request?: DispatchFromQueueRequest
}

export function useDispatchFromQueue() {
	const queryClient = useQueryClient()

	const mutation = useMutation<Run, Error, DispatchMutationVariables>({
		mutationFn: ({ issueIdentifier, request }) => dispatchFromQueue(issueIdentifier, request),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.launchQueue.all })
			queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.queue })
		}
	})

	const dispatch = useCallback(
		(issueIdentifier: string, request?: DispatchFromQueueRequest) => {
			mutation.mutate(
				{ issueIdentifier, request },
				{
					onSuccess: (run) => {
						toast.success(`Dispatched ${issueIdentifier}`, {
							description: `run ${run.id.slice(0, 8)} queued`
						})
					},
					onError: (err) => {
						if (err instanceof DuplicateRunError) {
							toast.error('Run already active', {
								description: `${issueIdentifier} already has a live run (${err.activeRunState}).`
							})
							return
						}
						toast.error('Dispatch failed', { description: err.message })
					}
				}
			)
		},
		[mutation]
	)

	return {
		dispatch,
		isPending: mutation.isPending
	}
}
