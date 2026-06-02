import type {
	AgentSession,
	AttentionRequest,
	CreateRunRequest,
	Interrupt,
	PullRequest,
	Run,
	RunDiffResponse,
	RunEvent,
	RunStep
} from '@/types'

import { BASE, postJson, postJsonChecked } from './_shared'

// Sentinel for `fetchRunDiff`: 404 → no_worktree, 422 → not_worktree_backed.
export type RunDiffUnavailableReason = 'no_worktree' | 'not_worktree_backed'

export interface RunDiffUnavailable {
	kind: 'unavailable'
	reason: RunDiffUnavailableReason
}

export type RunDiffResult = { kind: 'ok'; value: RunDiffResponse } | RunDiffUnavailable

export async function createRun(req: CreateRunRequest): Promise<Run> {
	return postJsonChecked('/runs', 'create run failed', req)
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

export async function fetchRunEvents(id: string): Promise<RunEvent[]> {
	const res = await fetch(`${BASE}/runs/${id}/events/log`)
	if (!res.ok) throw new Error(`GET /runs/${id}/events/log failed: ${res.status}`)
	return res.json()
}

export async function cancelRun(id: string): Promise<Run> {
	return postJson(`/runs/${id}/cancel`, 'cancel run failed')
}

export async function fetchRunDiff(id: string): Promise<RunDiffResult> {
	const res = await fetch(`${BASE}/runs/${id}/diff`)
	if (res.status === 404) return { kind: 'unavailable', reason: 'no_worktree' }
	if (res.status === 422) return { kind: 'unavailable', reason: 'not_worktree_backed' }
	if (!res.ok) throw new Error(`GET /runs/${id}/diff failed: ${res.status}`)
	return { kind: 'ok', value: (await res.json()) as RunDiffResponse }
}
