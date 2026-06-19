import type {
	ActiveTakeoversResponse,
	OpenTakeoverRequest,
	OpenedTakeover,
	TakeoverModesResponse
} from '@/types'

import { BASE, getJson, postJson, postVoid } from './_shared'

export function takeoverWsUrl(runId: string, takeoverSessionId: string): string {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
	return `${protocol}//${window.location.host}${BASE}/runs/${runId}/terminal/${takeoverSessionId}`
}

export async function fetchTakeoverModes(runId: string): Promise<TakeoverModesResponse> {
	return getJson(`/runs/${runId}/terminal-takeover/modes`, 'fetch takeover modes failed')
}

export async function openTakeover(runId: string, body: OpenTakeoverRequest): Promise<OpenedTakeover> {
	return postJson(`/runs/${runId}/terminal-takeover/open`, 'open takeover failed', body)
}

export async function closeTakeover(runId: string, takeoverSessionId: string): Promise<void> {
	return postVoid(`/runs/${runId}/terminal-takeover/${takeoverSessionId}/close`, 'close takeover failed')
}

export async function listActiveTakeovers(runId: string): Promise<ActiveTakeoversResponse> {
	return getJson(`/runs/${runId}/takeovers`, 'list takeovers failed')
}
