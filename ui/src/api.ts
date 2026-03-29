import type { Run, RunStep, RunEvent, Interrupt, InterruptAction, IssueListResponse, IssueDetailResponse } from '@/types'

const BASE = '/api'

export async function fetchIssues(limit = 50): Promise<IssueListResponse> {
	const res = await fetch(`${BASE}/issues?limit=${limit}`)
	if (!res.ok) throw new Error(`GET /issues failed: ${res.status}`)
	return res.json()
}

export async function fetchIssueDetail(id: string): Promise<IssueDetailResponse> {
	const res = await fetch(`${BASE}/issues/${id}`)
	if (!res.ok) throw new Error(`GET /issues/${id} failed: ${res.status}`)
	return res.json()
}

export async function fetchRuns(): Promise<Run[]> {
	const res = await fetch(`${BASE}/runs`)
	if (!res.ok) throw new Error(`GET /runs failed: ${res.status}`)
	return res.json()
}

export async function fetchRun(id: string): Promise<{ run: Run; steps: RunStep[]; interrupts: Interrupt[] }> {
	const res = await fetch(`${BASE}/runs/${id}`)
	if (!res.ok) throw new Error(`GET /runs/${id} failed: ${res.status}`)
	return res.json()
}

export async function answerInterrupt(
	runId: string,
	interruptId: string,
	action: InterruptAction
): Promise<void> {
	const res = await fetch(`${BASE}/runs/${runId}/interrupts/${interruptId}/answer`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(action)
	})
	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: `status ${res.status}` }))
		throw new Error(body.error || `answer interrupt failed: ${res.status}`)
	}
}

export async function cancelRun(id: string): Promise<Run> {
	const res = await fetch(`${BASE}/runs/${id}/cancel`, { method: 'POST' })
	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: `status ${res.status}` }))
		throw new Error(body.error || `cancel run failed: ${res.status}`)
	}
	return res.json()
}

export function subscribeToRunEvents(
	runId: string,
	onEvent: (event: RunEvent) => void,
	onDone: () => void,
	onError: (err: Event) => void
): () => void {
	const es = new EventSource(`${BASE}/runs/${runId}/events`)

	es.addEventListener('run_event', (e) => {
		const data: RunEvent = JSON.parse(e.data)
		onEvent(data)
	})

	es.addEventListener('done', () => {
		es.close()
		onDone()
	})

	es.onerror = (err) => {
		es.close()
		onError(err)
	}

	return () => es.close()
}
