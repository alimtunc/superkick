import type { AttentionReply, AttentionRequest, CreateAttentionRequest } from '@/types'

import { postJson } from './_shared'

export async function createAttentionRequest(
	runId: string,
	req: CreateAttentionRequest
): Promise<AttentionRequest> {
	return postJson(`/runs/${runId}/attention-requests`, 'create attention request failed', req)
}

export async function replyAttentionRequest(
	runId: string,
	requestId: string,
	reply: AttentionReply,
	repliedBy?: string
): Promise<AttentionRequest> {
	return postJson(
		`/runs/${runId}/attention-requests/${requestId}/reply`,
		'reply attention request failed',
		{ ...reply, replied_by: repliedBy }
	)
}

export async function cancelAttentionRequest(runId: string, requestId: string): Promise<AttentionRequest> {
	return postJson(
		`/runs/${runId}/attention-requests/${requestId}/cancel`,
		'cancel attention request failed'
	)
}
