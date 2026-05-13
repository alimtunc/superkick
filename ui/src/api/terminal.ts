import { BASE } from './_shared'

export function terminalWsUrl(runId: string): string {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
	return `${protocol}//${window.location.host}${BASE}/runs/${runId}/terminal`
}

export async function fetchTerminalHistory(runId: string): Promise<ArrayBuffer> {
	const res = await fetch(`${BASE}/runs/${runId}/terminal-history`)
	if (!res.ok) {
		throw new Error(`GET /runs/${runId}/terminal-history failed: ${res.status}`)
	}
	return res.arrayBuffer()
}
