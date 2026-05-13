import type { SseHandlers } from '@/types'

export const BASE = '/api'

export class DuplicateRunError extends Error {
	readonly activeRunId: string
	readonly activeRunState: string

	constructor(message: string, activeRunId: string, activeRunState: string) {
		super(message)
		this.name = 'DuplicateRunError'
		this.activeRunId = activeRunId
		this.activeRunState = activeRunState
	}
}

export class TurnAlreadyStreamingError extends Error {
	constructor(message = 'another turn is already streaming on this conversation') {
		super(message)
		this.name = 'TurnAlreadyStreamingError'
	}
}

export async function throwApiError(res: Response, fallbackLabel: string): Promise<never> {
	const body = await res.json().catch(() => ({ error: `status ${res.status}` }))
	if (res.status === 409 && body.active_run_id) {
		throw new DuplicateRunError(
			body.error || 'A run is already active for this issue',
			body.active_run_id,
			body.active_run_state
		)
	}
	throw new Error(body.error || `${fallbackLabel}: ${res.status}`)
}

export async function throwGenericApiError(res: Response, fallbackLabel: string): Promise<never> {
	const body = await res.json().catch(() => ({ error: `status ${res.status}` }))
	throw new Error(body.error || `${fallbackLabel}: ${res.status}`)
}

export function subscribeToSse<T>(path: string, eventName: string, handlers: SseHandlers<T>): () => void {
	const es = new EventSource(`${BASE}${path}`)

	es.addEventListener(eventName, (e) => {
		const data = JSON.parse(e.data) as T
		handlers.onEvent(data)
	})

	es.addEventListener('lagged', (e) => {
		const skipped = Number.parseInt(e.data, 10) || 0
		handlers.onLagged?.(skipped)
	})

	es.addEventListener('done', () => {
		es.close()
		handlers.onClosed?.()
	})

	es.addEventListener('error', (err) => {
		if (es.readyState !== EventSource.CLOSED) {
			return
		}
		es.close()
		handlers.onError?.(err)
	})

	return () => es.close()
}
