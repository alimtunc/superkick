import type {
	ActiveTakeoversResponse,
	Agent,
	AgentSession,
	AttachPayload,
	AttentionReply,
	AttentionRequest,
	CancelLaunchTaskResponse,
	Conversation,
	ConversationDetail,
	ConversationSummary,
	CreateAttentionRequest,
	CreateConversationRequest,
	CreateLaunchTaskRequest,
	CreateRunRequest,
	CreateTurnRequest,
	CreateTurnResponse,
	DashboardQueueResponse,
	DispatchFromQueueRequest,
	Interrupt,
	InterruptAction,
	IssueDetailResponse,
	IssueListResponse,
	LaunchQueueResponse,
	LaunchTask,
	LaunchTaskEvent,
	LaunchTaskStep,
	LaunchTaskWithSteps,
	OpenTakeoverRequest,
	OpenedTakeover,
	PullRequest,
	RetryLaunchTaskResponse,
	Run,
	RunStep,
	RuntimesResponse,
	ServerConfigResponse,
	TakeoverModesResponse,
	TurnEventEnvelope,
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

/**
 * Parse a non-OK response, promoting the 409/`active_run_id` shape into a
 * typed `DuplicateRunError` and falling back to a generic `Error` with the
 * server-supplied `error` string. Shared by every mutation that goes
 * through the duplicate-run guard (`POST /runs`, `dispatch_from_queue`) so
 * a change to the wire contract only touches one place.
 */
async function throwApiError(res: Response, fallbackLabel: string): Promise<never> {
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

async function throwGenericApiError(res: Response, fallbackLabel: string): Promise<never> {
	const body = await res.json().catch(() => ({ error: `status ${res.status}` }))
	throw new Error(body.error || `${fallbackLabel}: ${res.status}`)
}

export async function createRun(req: CreateRunRequest): Promise<Run> {
	const res = await fetch(`${BASE}/runs`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	})
	if (!res.ok) await throwApiError(res, 'create run failed')
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

export async function fetchDashboardQueue(): Promise<DashboardQueueResponse> {
	const res = await fetch(`${BASE}/dashboard/queue`)
	if (!res.ok) throw new Error(`GET /dashboard/queue failed: ${res.status}`)
	return res.json()
}

export async function fetchLaunchQueue(): Promise<LaunchQueueResponse> {
	const res = await fetch(`${BASE}/launch-queue`)
	if (!res.ok) throw new Error(`GET /launch-queue failed: ${res.status}`)
	return res.json()
}

/**
 * Dispatch a launchable Linear issue. Delegates server-side to the shared
 * spawn path, so the 409 `DuplicateRunError` contract is identical to
 * `POST /runs` — no fork in the UI error-handling surface.
 */
export async function dispatchFromQueue(
	issueIdentifier: string,
	req: DispatchFromQueueRequest = {}
): Promise<Run> {
	const res = await fetch(`${BASE}/launch-queue/${encodeURIComponent(issueIdentifier)}/dispatch`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	})
	if (!res.ok) await throwApiError(res, 'dispatch from queue failed')
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
	if (!res.ok) await throwGenericApiError(res, 'create attention request failed')
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
	if (!res.ok) await throwGenericApiError(res, 'reply attention request failed')
	return res.json()
}

export async function cancelAttentionRequest(runId: string, requestId: string): Promise<AttentionRequest> {
	const res = await fetch(`${BASE}/runs/${runId}/attention-requests/${requestId}/cancel`, {
		method: 'POST'
	})
	if (!res.ok) await throwGenericApiError(res, 'cancel attention request failed')
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
	if (!res.ok) await throwGenericApiError(res, 'answer interrupt failed')
}

export async function cancelRun(id: string): Promise<Run> {
	const res = await fetch(`${BASE}/runs/${id}/cancel`, { method: 'POST' })
	if (!res.ok) await throwGenericApiError(res, 'cancel run failed')
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

// ── Terminal takeover (SUP-101) ──────────────────────────────────────

/** Build the WebSocket URL for a SUP-101 takeover PTY. */
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

// ── Session attach ───────────────────────────────────────────────────

// ── Runtime registry ─────────────────────────────────────────────────

export async function fetchRuntimes(): Promise<RuntimesResponse> {
	const res = await fetch(`${BASE}/runtimes`)
	if (!res.ok) throw new Error(`GET /runtimes failed: ${res.status}`)
	return res.json()
}

export async function refreshRuntimes(): Promise<RuntimesResponse> {
	const res = await fetch(`${BASE}/runtimes/refresh`, { method: 'POST' })
	if (!res.ok) await throwGenericApiError(res, 'refresh runtimes failed')
	return res.json()
}

export async function prepareSessionAttach(runId: string, sessionId: string): Promise<AttachPayload> {
	const res = await fetch(`${BASE}/runs/${runId}/sessions/${sessionId}/attach`, {
		method: 'POST'
	})
	if (!res.ok) await throwGenericApiError(res, 'prepare attach failed')
	return res.json()
}

// ── Agents catalog (SUP-117) ─────────────────────────────────────────

/**
 * Project agent catalog projection. The launcher reads this to populate
 * per-step pickers; the catalog rarely changes so callers can use a long
 * staleTime safely.
 */
export async function listAgents(): Promise<Agent[]> {
	const res = await fetch(`${BASE}/agents`)
	if (!res.ok) await throwGenericApiError(res, 'list agents failed')
	const body = (await res.json()) as { agents: Agent[] }
	return body.agents
}

// ── Launch Tasks (SUP-116/117) ───────────────────────────────────────

export async function createLaunchTask(req: CreateLaunchTaskRequest): Promise<LaunchTaskWithSteps> {
	const res = await fetch(`${BASE}/launch-tasks`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	})
	if (!res.ok) await throwGenericApiError(res, 'create launch task failed')
	return res.json()
}

export async function listLaunchTasksForIssue(linearIssueId: string): Promise<LaunchTask[]> {
	const res = await fetch(`${BASE}/launch-tasks?linear_issue_id=${encodeURIComponent(linearIssueId)}`)
	if (!res.ok) await throwGenericApiError(res, 'list launch tasks failed')
	return res.json()
}

export async function fetchLaunchTaskSteps(taskId: string): Promise<LaunchTaskStep[]> {
	const res = await fetch(`${BASE}/launch-tasks/${encodeURIComponent(taskId)}/steps`)
	if (!res.ok) await throwGenericApiError(res, 'list launch task steps failed')
	return res.json()
}

// SUP-120 — operator-facing actions on a running launch task.

export async function cancelLaunchTask(taskId: string): Promise<CancelLaunchTaskResponse> {
	const res = await fetch(`${BASE}/launch-tasks/${encodeURIComponent(taskId)}/cancel`, {
		method: 'POST'
	})
	if (!res.ok) await throwGenericApiError(res, 'cancel launch task failed')
	return res.json()
}

export async function retryLaunchTask(taskId: string): Promise<RetryLaunchTaskResponse> {
	const res = await fetch(`${BASE}/launch-tasks/${encodeURIComponent(taskId)}/retry`, {
		method: 'POST'
	})
	if (!res.ok) await throwGenericApiError(res, 'retry launch task failed')
	return res.json()
}

// ── Conversations (SUP-100 structured chat) ──────────────────────────

/**
 * Thrown by `createTurn` when the conversation already has a non-terminal
 * turn streaming. Maps to the backend's 409 + `code: turn_already_streaming`.
 */
export class TurnAlreadyStreamingError extends Error {
	constructor(message = 'another turn is already streaming on this conversation') {
		super(message)
		this.name = 'TurnAlreadyStreamingError'
	}
}

export async function createConversation(req: CreateConversationRequest): Promise<Conversation> {
	const res = await fetch(`${BASE}/conversations`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	})
	if (!res.ok) await throwGenericApiError(res, 'create conversation failed')
	return res.json()
}

export async function fetchConversation(id: string): Promise<ConversationDetail> {
	const res = await fetch(`${BASE}/conversations/${id}`)
	if (!res.ok) throw new Error(`GET /conversations/${id} failed: ${res.status}`)
	return res.json()
}

export async function listConversationsByIssue(issueId: string): Promise<ConversationSummary[]> {
	const res = await fetch(`${BASE}/conversations?issue_id=${encodeURIComponent(issueId)}`)
	if (!res.ok) throw new Error(`GET /conversations?issue_id failed: ${res.status}`)
	const body = (await res.json()) as { conversations: ConversationSummary[] }
	return body.conversations
}

export async function listConversationsByRun(runId: string): Promise<ConversationSummary[]> {
	const res = await fetch(`${BASE}/conversations?run_id=${encodeURIComponent(runId)}`)
	if (!res.ok) throw new Error(`GET /conversations?run_id failed: ${res.status}`)
	const body = (await res.json()) as { conversations: ConversationSummary[] }
	return body.conversations
}

export async function createTurn(
	conversationId: string,
	req: CreateTurnRequest
): Promise<CreateTurnResponse> {
	const res = await fetch(`${BASE}/conversations/${conversationId}/turns`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	})
	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: `status ${res.status}` }))
		if (res.status === 409 && body.code === 'turn_already_streaming') {
			throw new TurnAlreadyStreamingError(body.error)
		}
		throw new Error(body.error || `create turn failed: ${res.status}`)
	}
	return res.json()
}

export async function cancelTurn(conversationId: string, turnId: string): Promise<void> {
	const res = await fetch(`${BASE}/conversations/${conversationId}/turns/${turnId}/cancel`, {
		method: 'POST'
	})
	if (!res.ok) await throwGenericApiError(res, 'cancel turn failed')
}

/**
 * Subscribe to the SSE event stream for a turn. Replays persisted events
 * first (server-side) then live-streams until the turn terminates. The
 * browser EventSource auto-reconnects with `Last-Event-ID`, which the server
 * uses to skip events the client has already seen.
 */
export function subscribeToTurnEvents(
	turnId: string,
	handlers: {
		onEvent: (envelope: TurnEventEnvelope) => void
		onLagged?: (skipped: number) => void
		onDone?: () => void
		onError?: (err: Event) => void
	}
): () => void {
	const es = new EventSource(`${BASE}/turns/${turnId}/events`)

	es.addEventListener('turn_event', (e) => {
		try {
			const envelope = JSON.parse(e.data) as TurnEventEnvelope
			handlers.onEvent(envelope)
		} catch (err) {
			handlers.onError?.(err as unknown as Event)
		}
	})

	es.addEventListener('lagged', (e) => {
		const skipped = Number.parseInt(e.data, 10) || 0
		handlers.onLagged?.(skipped)
	})

	es.addEventListener('done', () => {
		es.close()
		handlers.onDone?.()
	})

	es.addEventListener('error', (err) => {
		if (es.readyState === EventSource.CLOSED) {
			handlers.onError?.(err)
		}
	})

	return () => es.close()
}

export interface SseHandlers<T> {
	onEvent: (event: T) => void
	onLagged?: (skipped: number) => void
	onClosed?: () => void
	onError?: (err: Event) => void
}

/**
 * Open a shared-shape SSE stream: a typed `<eventName>` data channel plus the
 * `lagged` / `done` / `error` conventions every Superkick bus follows. Used by
 * both the workspace and launch-task brokers — keeping the parsing + closing
 * + error-classification logic here (instead of duplicated per stream) means a
 * single fix lands on every bus.
 */
function subscribeToSse<T>(path: string, eventName: string, handlers: SseHandlers<T>): () => void {
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

/**
 * Workspace-level event stream (SUP-84). One subscription feeds the shell
 * broker which fans out to every per-run / per-surface subscriber. Callers
 * outside the broker should almost never talk to this endpoint directly.
 */
export function subscribeToWorkspaceEvents(handlers: SseHandlers<WorkspaceRunEvent>): () => void {
	return subscribeToSse('/events', 'workspace_event', handlers)
}

/**
 * Launch-task event stream (SUP-123). Parallel to `subscribeToWorkspaceEvents`
 * because the backend keeps the launch-task bus separate from the run bus
 * (different back-pressure budgets — see
 * `crates/superkick-runtime/src/launch_task_event_bus.rs`). Callers outside
 * the shell broker should not talk to this endpoint directly.
 */
export function subscribeToLaunchTaskEvents(handlers: SseHandlers<LaunchTaskEvent>): () => void {
	return subscribeToSse('/launch-tasks/events', 'launch_task_event', handlers)
}
