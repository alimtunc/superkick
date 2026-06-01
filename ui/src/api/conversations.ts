import type {
	Conversation,
	ConversationDetail,
	ConversationSummary,
	CreateConversationRequest,
	CreateTurnRequest,
	CreateTurnResponse,
	RunToolCall,
	TurnEventEnvelope
} from '@/types'

import {
	BASE,
	TurnAlreadyStreamingError,
	apiErrorField,
	apiErrorMessage,
	postJson,
	postVoid,
	readApiErrorBody,
	subscribeToSse
} from './_shared'

export async function createConversation(req: CreateConversationRequest): Promise<Conversation> {
	return postJson('/conversations', 'create conversation failed', req)
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
	const res = await fetch(`${BASE}/conversations/${id}`)
	if (!res.ok) throw new Error(`GET /conversations/${id} failed: ${res.status}`)
	return res.json()
}

export async function listConversationsByIssue(issueId: string): Promise<ConversationSummary[]> {
	const res = await fetch(`${BASE}/conversations?issue_id=${encodeURIComponent(issueId)}`)
	if (!res.ok) throw new Error(`GET /conversations?issue_id failed: ${res.status}`)
	const body = (await res.json()) as { conversations: ConversationSummary[] }
	return body.conversations
}

export async function listConversationsByRun(runId: string): Promise<ConversationSummary[]> {
	const res = await fetch(`${BASE}/conversations?run_id=${encodeURIComponent(runId)}`)
	if (!res.ok) throw new Error(`GET /conversations?run_id failed: ${res.status}`)
	const body = (await res.json()) as { conversations: ConversationSummary[] }
	return body.conversations
}

export async function fetchRunToolCalls(runId: string): Promise<RunToolCall[]> {
	const conversations = await listConversationsByRun(runId)
	if (conversations.length === 0) return []
	const details = await Promise.all(conversations.map((c) => fetchConversation(c.id)))
	const calls: RunToolCall[] = []
	for (const detail of details) {
		for (const turn of detail.turns) {
			const events = detail.events_by_turn[turn.id] ?? []
			const results = new Map<string, { output: unknown; is_error: boolean }>()
			for (const event of events) {
				if (event.envelope.kind === 'tool_result') {
					results.set(event.envelope.call_id, {
						output: event.envelope.output,
						is_error: event.envelope.is_error
					})
				}
			}
			for (const event of events) {
				if (event.envelope.kind !== 'tool_use') continue
				const paired = results.get(event.envelope.call_id) ?? null
				calls.push({
					call_id: event.envelope.call_id,
					tool_name: event.envelope.tool_name,
					conversation_id: detail.conversation.id,
					turn_id: turn.id,
					at: event.envelope.at,
					input: event.envelope.input,
					output: paired?.output ?? null,
					is_error: paired?.is_error ?? false
				})
			}
		}
	}
	calls.sort((a, b) => a.at.localeCompare(b.at))
	return calls
}

export async function createTurn(
	conversationId: string,
	req: CreateTurnRequest
): Promise<CreateTurnResponse> {
	const res = await fetch(`${BASE}/conversations/${conversationId}/turns`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	})
	if (!res.ok) {
		const body = await readApiErrorBody(res)
		if (res.status === 409 && apiErrorField(body, 'code') === 'turn_already_streaming') {
			throw new TurnAlreadyStreamingError(apiErrorField(body, 'error'))
		}
		throw new Error(apiErrorMessage(body, `create turn failed: ${res.status}`))
	}
	return res.json()
}

export async function cancelTurn(conversationId: string, turnId: string): Promise<void> {
	await postVoid(`/conversations/${conversationId}/turns/${turnId}/cancel`, 'cancel turn failed')
}

export function subscribeToTurnEvents(
	turnId: string,
	handlers: {
		onEvent: (envelope: TurnEventEnvelope) => void
		onLagged?: (skipped: number) => void
		onDone?: () => void
		onError?: (err: Event) => void
	}
): () => void {
	return subscribeToSse<TurnEventEnvelope>(`/turns/${turnId}/events`, 'turn_event', {
		onEvent: handlers.onEvent,
		onLagged: handlers.onLagged,
		onClosed: handlers.onDone,
		onError: handlers.onError
	})
}
