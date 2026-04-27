export type EventKind =
	| 'state_change'
	| 'step_started'
	| 'step_completed'
	| 'step_failed'
	| 'agent_output'
	| 'command_output'
	| 'interrupt_created'
	| 'interrupt_resolved'
	| 'review_completed'
	| 'error'
	| 'external_attach'
	| 'operator_input'
	| 'attention_requested'
	| 'attention_replied'
	| 'attention_cancelled'
	| 'handoff_created'
	| 'handoff_delivered'
	| 'handoff_completed'
	| 'handoff_failed'
	| 'ownership_taken_over'
	| 'ownership_released'
	| 'ownership_suspended'
	| 'ownership_resumed'
	| 'session_spawned'
	| 'session_completed'
	| 'session_failed'
	| 'session_cancelled'
	| 'budget_tripped'
	| 'approval_gate_entered'

export type EventLevel = 'debug' | 'info' | 'warn' | 'error'

export interface RunEvent {
	id: string
	run_id: string
	run_step_id: string | null
	ts: string
	kind: EventKind
	level: EventLevel
	message: string
	payload_json: unknown
}

export type SessionLifecyclePhaseTag =
	| 'spawning'
	| 'running'
	| 'completed'
	| 'failed'
	| 'cancelled'
	| 'timed_out'

export interface SessionLifecycleEvent {
	id: string
	session_id: string
	run_id: string
	step_id: string
	role: string | null
	parent_session_id: string | null
	launch_reason: string | null
	handoff_id: string | null
	phase: { phase: SessionLifecyclePhaseTag; exit_code?: number; reason?: string }
	ts: string
}

/**
 * Issue-scope event payload (SUP-81). Blocker-resolution transitions live at
 * the Linear-issue level — not a run — so they flow on the same bus but with
 * `run_id` omitted on the envelope. The backend flattens `kind` + payload
 * fields alongside the outer `type: 'issue_event'` discriminant.
 */
export interface DependencyResolvedEvent {
	kind: 'dependency_resolved'
	blocker_issue_id: string
	blocker_identifier: string
	downstream_issue_id: string
	downstream_identifier: string
	resolved_at: string
}

export type IssueEvent = DependencyResolvedEvent

/**
 * Workspace-level run event envelope (SUP-84 + SUP-81). The shell broker
 * subscribes once to `GET /api/events` and receives every event produced
 * process-wide wrapped in this tagged union. The Rust backend flattens the
 * inner event fields alongside the `type` discriminant.
 */
export type WorkspaceRunEvent =
	| ({ type: 'run_event' } & RunEvent)
	| ({ type: 'session_lifecycle' } & SessionLifecycleEvent)
	| ({ type: 'issue_event' } & IssueEvent)

/**
 * Shell broker subscription filter. Omit fields to match everything — the
 * broker treats each field independently (AND-semantics across fields).
 */
export interface SubscriptionFilter {
	/** Only deliver events for this run. Omit to receive every run. */
	runId?: string
	/** Only deliver this variant. Omit to receive every variant. */
	variant?: WorkspaceRunEvent['type']
}

/**
 * Emitted by the broker when the backend reports a lag gap — persisted
 * audit tables remain authoritative, consumers should reconcile by
 * refetching affected runs.
 */
export interface LaggedNotice {
	type: 'lagged'
	skipped: number
}

export type BrokerNotice = WorkspaceRunEvent | LaggedNotice

export type WorkspaceEventSubscriber = (event: BrokerNotice) => void
