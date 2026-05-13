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

type ApiErrorBody = Record<string, unknown>

function isRecord(value: unknown): value is ApiErrorBody {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function readApiErrorBody(res: Response): Promise<ApiErrorBody> {
	const raw: unknown = await res.json().catch(() => ({ error: `status ${res.status}` }))
	return isRecord(raw) ? raw : { error: `status ${res.status}` }
}

export function apiErrorField(body: ApiErrorBody, key: string): string | undefined {
	const value = body[key]
	return typeof value === 'string' ? value : undefined
}

export function apiErrorMessage(body: ApiErrorBody, fallback: string): string {
	return apiErrorField(body, 'error') ?? fallback
}

export async function throwApiError(res: Response, fallbackLabel: string): Promise<never> {
	const body = await readApiErrorBody(res)
	const activeRunId = apiErrorField(body, 'active_run_id')
	if (res.status === 409 && activeRunId) {
		throw new DuplicateRunError(
			apiErrorMessage(body, 'A run is already active for this issue'),
			activeRunId,
			apiErrorField(body, 'active_run_state') ?? 'unknown'
		)
	}
	throw new Error(apiErrorMessage(body, `${fallbackLabel}: ${res.status}`))
}

export async function throwGenericApiError(res: Response, fallbackLabel: string): Promise<never> {
	const body = await readApiErrorBody(res)
	throw new Error(apiErrorMessage(body, `${fallbackLabel}: ${res.status}`))
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
