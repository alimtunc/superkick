import { createRun, type CreateRunRequest } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { Run } from '@/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

interface UseCreateRunOptions {
	issueId?: string
}

export function useCreateRun({ issueId }: UseCreateRunOptions = {}) {
	const queryClient = useQueryClient()
	const navigate = useNavigate()

	return useMutation({
		mutationFn: (req: CreateRunRequest) => createRun(req),
		onSuccess: (run: Run) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
			if (issueId) {
				queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) })
			}
			navigate({ to: '/runs/$runId', params: { runId: run.id } })
		}
	})
}
