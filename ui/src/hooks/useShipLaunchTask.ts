import { createIssueComment, patchIssue, shipRun } from '@/api'
import { invalidateAfterRunOrTaskStateChange } from '@/lib/queryInvalidation'
import type { ShipMode, ShipRunResponse } from '@/types'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface UseShipLaunchTaskParams {
	issueId: string
	taskId: string
	runId: string
	teamId: string | null
}

interface ShipSubmit {
	mode: ShipMode
	title: string
	body: string
	/** Linear comment to post, or null to skip. */
	comment: string | null
	/** Pre-resolved Linear workflow-state id to move to, or null for no change. */
	statusStateId: string | null
}

/**
 * Orchestrates an operator ship. The PR push/create is the irreversible action,
 * so it runs first and its result stands: the mutation only rejects when the PR
 * itself fails. The Linear comment + status writes are best-effort — a failure
 * there raises a separate warning toast but does NOT fail the ship (which would
 * misleadingly report "Ship failed" after the PR was already opened, and leave
 * the new PR uninvalidated).
 */
export function useShipLaunchTask(params: UseShipLaunchTaskParams) {
	const queryClient = useQueryClient()

	return useMutation<ShipRunResponse, Error, ShipSubmit>({
		mutationFn: async ({ mode, title, body, comment, statusStateId }) => {
			const result = await shipRun(params.runId, { mode, title, body })
			const linearWarnings: string[] = []
			if (comment) {
				try {
					await createIssueComment(params.issueId, comment)
				} catch (err) {
					linearWarnings.push((err as Error).message)
				}
			}
			if (statusStateId) {
				try {
					await patchIssue(params.issueId, {
						state_id: statusStateId,
						team_id: params.teamId ?? undefined
					})
				} catch (err) {
					linearWarnings.push((err as Error).message)
				}
			}
			if (linearWarnings.length > 0) {
				toast.warning('PR ready, but Linear update failed', {
					description: linearWarnings.join('; ')
				})
			}
			return result
		},
		onSuccess: () =>
			invalidateAfterRunOrTaskStateChange(queryClient, {
				issueId: params.issueId,
				taskId: params.taskId,
				runId: params.runId
			}),
		onError: (err) => toast.error('Ship failed', { description: err.message })
	})
}
