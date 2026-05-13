import type { AttentionReply, AttentionRequest, CreateAttentionRequest } from '@/types'

import { BASE, throwGenericApiError } from './_shared'

export async function createAttentionRequest(
	runId: string,
	req: CreateAttentionRequest
): Promise<AttentionRequest> {
	const res = await fetch(`${BASE}/runs/${runId}/attention-requests`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	})
	if (!res.ok) await throwGenericApiError(res, 'create attention request failed')
	return res.json()
}

export async function replyAttentionRequest(
	runId: string,
	requestId: string,
	reply: AttentionReply,
	repliedBy?: string
): Promise<AttentionRequest> {
	const res = await fetch(`${BASE}/runs/${runId}/attention-requests/${requestId}/reply`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ...reply, replied_by: repliedBy })
	})
	if (!res.ok) await throwGenericApiError(res, 'reply attention request failed')
	return res.json()
}

export async function cancelAttentionRequest(runId: string, requestId: string): Promise<AttentionRequest> {
	const res = await fetch(`${BASE}/runs/${runId}/attention-requests/${requestId}/cancel`, {
		method: 'POST'
	})
	if (!res.ok) await throwGenericApiError(res, 'cancel attention request failed')
	return res.json()
}
