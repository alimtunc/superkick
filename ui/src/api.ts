import type {
	AgentSession,
	AttachPayload,
	ExecutionMode,
	Run,
	RunStep,
	RunEvent,
	Interrupt,
	InterruptAction,
	IssueListResponse,
	IssueDetailResponse,
	LaunchProfile,
	PullRequest
} from '@/types'

const BASE = '/api'

// ── Config ────────────────────────────────────────────────────────────

export interface ServerConfigResponse {
	repo_slug: string
	base_branch: string
	launch_profile: LaunchProfile
}

export async function fetchConfig(): Promise<ServerConfigResponse> {
	const res = await fetch(`${BASE}/config`)
	if (!res.ok) throw new Error(`GET /config failed: ${res.status}`)
	return res.json()
}

// ── Run creation ──────────────────────────────────────────────────────

export interface CreateRunRequest {
	repo_slug: string
	issue_id: string
	issue_identifier: string
	base_branch?: string
	use_worktree?: boolean
	execution_mode?: ExecutionMode
	operator_instructions?: string
}

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
	pr: PullRequest | null
}> {
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

	es.addEventListener('error', (err) => {
		if (es.readyState !== EventSource.CLOSED) {
			return
		}
		es.close()
		onError(err)
	})

	return () => es.close()
}
