import type {
	AgentSession,
	AttentionRequest,
	CreateRunRequest,
	Interrupt,
	PullRequest,
	Run,
	RunStep
} from '@/types'

import { BASE, throwApiError, throwGenericApiError } from './_shared'

export async function createRun(req: CreateRunRequest): Promise<Run> {
	const res = await fetch(`${BASE}/runs`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	})
	if (!res.ok) await throwApiError(res, 'create run failed')
	return res.json()
}

export async function fetchRuns(): Promise<Run[]> {
	const res = await fetch(`${BASE}/runs`)
	if (!res.ok) throw new Error(`GET /runs failed: ${res.status}`)
	return res.json()
}

export async function fetchRun(id: string): Promise<{
	run: Run
	steps: RunStep[]
	sessions: AgentSession[]
	interrupts: Interrupt[]
	attention_requests: AttentionRequest[]
	pr: PullRequest | null
}> {
	const res = await fetch(`${BASE}/runs/${id}`)
	if (!res.ok) throw new Error(`GET /runs/${id} failed: ${res.status}`)
	return res.json()
}

export async function cancelRun(id: string): Promise<Run> {
	const res = await fetch(`${BASE}/runs/${id}/cancel`, { method: 'POST' })
	if (!res.ok) await throwGenericApiError(res, 'cancel run failed')
	return res.json()
}
