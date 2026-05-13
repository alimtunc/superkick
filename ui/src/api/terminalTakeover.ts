import type {
	ActiveTakeoversResponse,
	OpenTakeoverRequest,
	OpenedTakeover,
	TakeoverModesResponse
} from '@/types'

import { BASE, throwGenericApiError } from './_shared'

export function takeoverWsUrl(runId: string, takeoverSessionId: string): string {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
	return `${protocol}//${window.location.host}${BASE}/runs/${runId}/terminal/${takeoverSessionId}`
}

export async function fetchTakeoverModes(runId: string): Promise<TakeoverModesResponse> {
	const res = await fetch(`${BASE}/runs/${runId}/terminal-takeover/modes`)
	if (!res.ok) await throwGenericApiError(res, 'fetch takeover modes failed')
	return res.json()
}

export async function openTakeover(runId: string, body: OpenTakeoverRequest): Promise<OpenedTakeover> {
	const res = await fetch(`${BASE}/runs/${runId}/terminal-takeover/open`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	})
	if (!res.ok) await throwGenericApiError(res, 'open takeover failed')
	return res.json()
}

export async function closeTakeover(runId: string, takeoverSessionId: string): Promise<void> {
	const res = await fetch(`${BASE}/runs/${runId}/terminal-takeover/${takeoverSessionId}/close`, {
		method: 'POST'
	})
	if (!res.ok && res.status !== 204) await throwGenericApiError(res, 'close takeover failed')
}

export async function listActiveTakeovers(runId: string): Promise<ActiveTakeoversResponse> {
	const res = await fetch(`${BASE}/runs/${runId}/takeovers`)
	if (!res.ok) await throwGenericApiError(res, 'list takeovers failed')
	return res.json()
}
