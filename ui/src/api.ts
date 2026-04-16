import type {
	AgentSession,
	AttachPayload,
	AttentionReply,
	AttentionRequest,
	CreateAttentionRequest,
	CreateRunRequest,
	Interrupt,
	InterruptAction,
	IssueDetailResponse,
	IssueListResponse,
	PullRequest,
	Run,
	RunStep,
	ServerConfigResponse,
	WorkspaceRunEvent
} from '@/types'

const BASE = '/api'

// ── Config ────────────────────────────────────────────────────────────

export async function fetchConfig(): Promise<ServerConfigResponse> {
	const res = await fetch(`${BASE}/config`)
	if (!res.ok) throw new Error(`GET /config failed: ${res.status}`)
	return res.json()
}

// ── Run creation ──────────────────────────────────────────────────────

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

export async function createRun(req: CreateRunRequest): Promise<Run> {
	const res = await fetch(`${BASE}/runs`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	})
	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: `status ${res.status}` }))
		if (res.status === 409 && body.active_run_id) {
			throw new DuplicateRunError(
				body.error || 'A run is already active for this issue',
				body.active_run_id,
				body.active_run_state
			)
		}
		throw new Error(body.error || `create run failed: ${res.status}`)
	}
	return res.json()
}

// ── Issues ────────────────────────────────────────────────────────────

export async function fetchIssues(limit = 200): Promise<IssueListResponse> {
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

// ── Attention requests (structured operator arbitration) ─────────────

export async function createAttentionRequest(
	runId: string,
	req: CreateAttentionRequest
): Promise<AttentionRequest> {
	const res = await fetch(`${BASE}/runs/${runId}/attention-requests`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	})
	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: `status ${res.status}` }))
		throw new Error(body.error || `create attention request failed: ${res.status}`)
	}
	return res.json()
}

export async function replyAttentionRequest(
	runId: string,
	requestId: string,
	reply: AttentionReply,
	repliedBy?: string
): Promise<AttentionRequest> {
	const res = await fetch(`${BASE}/runs/${runId}/attention-requests/${requestId}/reply`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ...reply, replied_by: repliedBy })
	})
	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: `status ${res.status}` }))
		throw new Error(body.error || `reply attention request failed: ${res.status}`)
	}
	return res.json()
}

export async function cancelAttentionRequest(runId: string, requestId: string): Promise<AttentionRequest> {
	const res = await fetch(`${BASE}/runs/${runId}/attention-requests/${requestId}/cancel`, {
		method: 'POST'
	})
	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: `status ${res.status}` }))
		throw new Error(body.error || `cancel attention request failed: ${res.status}`)
	}
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

// ── Terminal ─────────────────────────────────────────────────────────

/** Build the WebSocket URL for attaching to a live PTY terminal. */
export function terminalWsUrl(runId: string): string {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
	return `${protocol}//${window.location.host}${BASE}/runs/${runId}/terminal`
}

/** Fetch durable terminal transcript (binary) for a completed or cleaned-up run. */
export async function fetchTerminalHistory(runId: string): Promise<ArrayBuffer> {
	const res = await fetch(`${BASE}/runs/${runId}/terminal-history`)
	if (!res.ok) {
		throw new Error(`GET /runs/${runId}/terminal-history failed: ${res.status}`)
	}
	return res.arrayBuffer()
}

// ── Session attach ───────────────────────────────────────────────────

export async function prepareSessionAttach(runId: string, sessionId: string): Promise<AttachPayload> {
	const res = await fetch(`${BASE}/runs/${runId}/sessions/${sessionId}/attach`, {
		method: 'POST'
	})
	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: `status ${res.status}` }))
		throw new Error(body.error || `prepare attach failed: ${res.status}`)
	}
	return res.json()
}

/**
 * Workspace-level event stream (SUP-84). One subscription feeds the shell
 * broker which fans out to every per-run / per-surface subscriber. Callers
 * outside the broker should almost never talk to this endpoint directly.
 */
export function subscribeToWorkspaceEvents(handlers: {
	onEvent: (event: WorkspaceRunEvent) => void
	onLagged?: (skipped: number) => void
	onClosed?: () => void
	onError?: (err: Event) => void
}): () => void {
	const es = new EventSource(`${BASE}/events`)

	es.addEventListener('workspace_event', (e) => {
		const data: WorkspaceRunEvent = JSON.parse(e.data)
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
