import type { FailureClassification, LaunchStepKind, LaunchTaskStatus, LaunchTaskStepStatus } from './launch'
import type { RunState } from './runs'

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
	| 'terminal_takeover_opened'
	| 'terminal_takeover_closed'

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
 * Recovery scheduler stalled-reason payload (SUP-73). Mirrors
 * `superkick_core::recovery::StalledReason` so the structured cause is
 * available to subscribers without re-deriving copy.
 */
export type StalledReason =
	| { kind: 'never_dispatched'; state: string; age_secs: number }
	| { kind: 'awaiting_human'; age_secs: number }
	| { kind: 'no_heartbeat'; state: string; age_secs: number }

export interface RunStalledPayload {
	run_id: string
	since: string
	reason: StalledReason
	detected_at: string
}

export interface RunRecoveredPayload {
	run_id: string
	detected_at: string
}

/**
 * SUP-151 — emitted when an `IssueWorkspaceContext` memory entry is appended
 * (subject to SUP-148's POST endpoint). Carries the affected issue so cache
 * invalidation can target a single key.
 */
export interface MemoryAppendedPayload {
	issue_id: string
	entry_id: string
}

/**
 * SUP-151 — emitted when the aggregate context (snapshot / comment excerpts /
 * linked items) is refreshed. Coarse-grained: the UI re-fetches the whole
 * aggregate rather than reconciling deltas.
 */
export interface ContextUpdatedPayload {
	issue_id: string
}

/**
 * Workspace-level run event envelope (SUP-84 + SUP-81 + SUP-73 + SUP-151). The
 * shell broker subscribes once to `GET /api/events` and receives every event
 * produced process-wide wrapped in this tagged union. The Rust backend
 * flattens the inner event fields alongside the `type` discriminant.
 */
export type WorkspaceRunEvent =
	| ({ type: 'run_event' } & RunEvent)
	| ({ type: 'session_lifecycle' } & SessionLifecycleEvent)
	| ({ type: 'issue_event' } & IssueEvent)
	| ({ type: 'run_stalled' } & RunStalledPayload)
	| ({ type: 'run_recovered' } & RunRecoveredPayload)
	| ({ type: 'memory_appended' } & MemoryAppendedPayload)
	| ({ type: 'context_updated' } & ContextUpdatedPayload)

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

/**
 * Launch-task event envelope (SUP-123). Mirrors
 * `superkick_runtime::LaunchTaskEvent`, which serialises with
 * `#[serde(tag = "kind", rename_all = "snake_case")]` — every variant
 * carries a `kind` discriminant and flattens its payload alongside.
 *
 * Persistence remains authoritative: on `lagged`, consumers reconcile by
 * refetching the affected task. See
 * `crates/superkick-runtime/src/launch_task_event_bus.rs`.
 */
export type LaunchTaskEvent =
	| {
			kind: 'step_started'
			task_id: string
			linear_issue_id: string
			step_id: string
			step_kind: LaunchStepKind
			agent_name: string
			sequence: number
	  }
	| {
			kind: 'step_finished'
			task_id: string
			linear_issue_id: string
			step_id: string
			step_kind: LaunchStepKind
			status: LaunchTaskStepStatus
			summary: string | null
			failure_classification?: FailureClassification | null
	  }
	| {
			kind: 'task_status_changed'
			task_id: string
			linear_issue_id: string
			status: LaunchTaskStatus
			current_step_id: string | null
			reason: string | null
	  }
	| {
			kind: 'shadow_run_state_changed'
			task_id: string
			linear_issue_id: string
			run_id: string
			state: RunState
	  }

/**
 * Discriminant of `LaunchTaskEvent`. Exhaustive switches over this type catch a
 * new Rust variant at compile time instead of silently routing to a `default`
 * branch.
 */
export type LaunchTaskEventKind = LaunchTaskEvent['kind']

export interface LaunchTaskSubscriptionFilter {
	linearIssueId?: string
}

export type LaunchTaskBrokerNotice = LaunchTaskEvent | LaggedNotice

export type LaunchTaskEventSubscriber = (notice: LaunchTaskBrokerNotice) => void
