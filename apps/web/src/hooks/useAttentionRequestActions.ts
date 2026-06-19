import { cancelAttentionRequest, replyAttentionRequest } from '@/api'
import type { AttentionReply } from '@/types'
import { useMutation } from '@tanstack/react-query'

export function useAttentionRequestActions(runId: string, requestId: string, onUpdated: () => void) {
	const replyMutation = useMutation({
		mutationFn: (reply: AttentionReply) => replyAttentionRequest(runId, requestId, reply),
		onSuccess: onUpdated
	})

	const cancelMutation = useMutation({
		mutationFn: () => cancelAttentionRequest(runId, requestId),
		onSuccess: onUpdated
	})

	const submitting = replyMutation.isPending || cancelMutation.isPending
	const activeError = replyMutation.error ?? cancelMutation.error
	const error = activeError ? String(activeError) : null

	return {
		submitting,
		error,
		reply: (value: AttentionReply) => replyMutation.mutate(value),
		cancel: () => cancelMutation.mutate()
	}
}
