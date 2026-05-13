import type {
	Conversation,
	ConversationDetail,
	ConversationSummary,
	CreateConversationRequest,
	CreateTurnRequest,
	CreateTurnResponse,
	TurnEventEnvelope
} from '@/types'

import { BASE, TurnAlreadyStreamingError, throwGenericApiError } from './_shared'

export async function createConversation(req: CreateConversationRequest): Promise<Conversation> {
	const res = await fetch(`${BASE}/conversations`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	})
	if (!res.ok) await throwGenericApiError(res, 'create conversation failed')
	return res.json()
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
		const body = await res.json().catch(() => ({ error: `status ${res.status}` }))
		if (res.status === 409 && body.code === 'turn_already_streaming') {
			throw new TurnAlreadyStreamingError(body.error)
		}
		throw new Error(body.error || `create turn failed: ${res.status}`)
	}
	return res.json()
}

export async function cancelTurn(conversationId: string, turnId: string): Promise<void> {
	const res = await fetch(`${BASE}/conversations/${conversationId}/turns/${turnId}/cancel`, {
		method: 'POST'
	})
	if (!res.ok) await throwGenericApiError(res, 'cancel turn failed')
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
	const es = new EventSource(`${BASE}/turns/${turnId}/events`)

	es.addEventListener('turn_event', (e) => {
		try {
			const envelope = JSON.parse(e.data) as TurnEventEnvelope
			handlers.onEvent(envelope)
		} catch (err) {
			handlers.onError?.(err as unknown as Event)
		}
	})

	es.addEventListener('lagged', (e) => {
		const skipped = Number.parseInt(e.data, 10) || 0
		handlers.onLagged?.(skipped)
	})

	es.addEventListener('done', () => {
		es.close()
		handlers.onDone?.()
	})

	es.addEventListener('error', (err) => {
		if (es.readyState === EventSource.CLOSED) {
			handlers.onError?.(err)
		}
	})

	return () => es.close()
}
