import { useCallback } from 'react'

import { createRun } from '@/api'
import { queryKeys } from '@/lib/queryKeys'
import type { CreateRunRequest, LaunchParams, Run } from '@/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

interface UseCreateRunOptions {
	issueId?: string
}

export function useCreateRun({ issueId }: UseCreateRunOptions = {}) {
	const queryClient = useQueryClient()
	const navigate = useNavigate()

	const mutation = useMutation({
		mutationFn: (req: CreateRunRequest) => createRun(req),
		onSuccess: (run: Run) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
			if (issueId) {
				queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) })
			}
			navigate({ to: '/runs/$runId', params: { runId: run.id } })
		}
	})

	const launch = useCallback(
		(params: LaunchParams) => {
			mutation.mutate(
				{
					repo_slug: params.config.repo_slug,
					issue_id: params.issueId,
					issue_identifier: params.issueIdentifier,
					base_branch: params.config.base_branch,
					use_worktree: params.useWorktree,
					execution_mode: params.executionMode,
					operator_instructions: params.operatorInstructions
				},
				{ onSuccess: params.onSuccess }
			)
		},
		[mutation]
	)

	return { ...mutation, launch }
}
