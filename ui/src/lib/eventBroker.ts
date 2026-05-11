/**
 * Shell-level event brokers (SUP-84 / SUP-123).
 *
 * Each broker owns the single `EventSource` for one Superkick bus and fans the
 * stream out to per-page / per-rail subscribers, so the number of open
 * connections stays at exactly one per bus regardless of how many surfaces are
 * watching. The transport is hidden — subscribers pass a filter + callback and
 * never touch `EventSource`.
 *
 * Lifecycle (shared via the generic `SseBroker`):
 *   - `start()` opens the stream; idempotent so React effects can call it.
 *   - On `error`/`close`, exponential-backoff reconnect up to a cap.
 *   - On `lagged`, a synthetic `LaggedNotice` is broadcast to every subscriber
 *     regardless of filter — any of them may have missed events.
 *   - `stop()` closes the stream and drops every subscriber; call only on full
 *     app teardown.
 */

import { subscribeToLaunchTaskEvents, subscribeToWorkspaceEvents } from '@/api'
import type { SseHandlers } from '@/api'
import type {
	LaggedNotice,
	LaunchTaskEvent,
	LaunchTaskSubscriptionFilter,
	SubscriptionFilter,
	WorkspaceRunEvent
} from '@/types'

const RECONNECT_MIN_MS = 500
const RECONNECT_MAX_MS = 10_000

export type SubscribeFn<E> = (handlers: SseHandlers<E>) => () => void

interface SseBrokerOptions<Event, Filter> {
	/** Open the underlying SSE stream. Swapped in tests for an in-memory harness. */
	subscribe: SubscribeFn<Event>
	/** Per-subscriber filter predicate. Lagged notices bypass this and reach everyone. */
	matches: (filter: Filter, event: Event) => boolean
	/** Symbol description for new subscribers (debug only). */
	label: string
}

interface SubscriberEntry<Event, Filter> {
	filter: Filter
	callback: (notice: Event | LaggedNotice) => void
}

/**
 * Generic event broker shared by every Superkick SSE bus. Parameterised over
 * the event shape and the per-subscriber filter shape so the workspace broker
 * (run events, `{runId, variant}` filter) and the launch-task broker
 * (launch-task events, `{linearIssueId}` filter) share one implementation.
 */
export class SseBroker<Event, Filter> {
	private subscribers = new Map<symbol, SubscriberEntry<Event, Filter>>()
	private connectionListeners = new Set<(connected: boolean) => void>()
	private stopStream: (() => void) | null = null
	private started = false
	private connected = false
	private reconnectDelay = RECONNECT_MIN_MS
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null

	constructor(private readonly options: SseBrokerOptions<Event, Filter>) {}

	/** Open the stream. Idempotent — extra calls while connected are no-ops. */
	start(): void {
		if (this.started) return
		this.started = true
		this.connect()
	}

	/**
	 * Close the stream and drop every subscriber. Only call on full teardown —
	 * per-subscriber cleanup is handled by the `unsubscribe` return value.
	 */
	stop(): void {
		this.started = false
		this.stopStream?.()
		this.stopStream = null
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
		this.subscribers.clear()
		this.setConnected(false)
	}

	subscribe(filter: Filter, callback: (notice: Event | LaggedNotice) => void): () => void {
		const key = Symbol(this.options.label)
		this.subscribers.set(key, { filter, callback })
		return () => {
			this.subscribers.delete(key)
		}
	}

	/**
	 * Subscribe to connection-state changes. Fires synchronously with the
	 * current value, then on every transition. Returns an unsubscribe.
	 */
	subscribeConnection(callback: (connected: boolean) => void): () => void {
		this.connectionListeners.add(callback)
		callback(this.connected)
		return () => {
			this.connectionListeners.delete(callback)
		}
	}

	isConnected(): boolean {
		return this.connected
	}

	/** Test-only: publish an event without going through SSE. */
	publishForTest(event: Event): void {
		this.fanOut(event)
	}

	private connect(): void {
		this.stopStream = this.options.subscribe({
			onEvent: (event) => {
				this.reconnectDelay = RECONNECT_MIN_MS
				this.setConnected(true)
				this.fanOut(event)
			},
			onLagged: (skipped) => {
				const notice: LaggedNotice = { type: 'lagged', skipped }
				for (const { callback } of this.subscribers.values()) {
					callback(notice)
				}
			},
			onClosed: () => {
				this.stopStream = null
				this.setConnected(false)
				this.scheduleReconnect()
			},
			onError: () => {
				this.stopStream = null
				this.setConnected(false)
				this.scheduleReconnect()
			}
		})
	}

	private scheduleReconnect(): void {
		if (!this.started) return
		if (this.reconnectTimer) return
		const delay = this.reconnectDelay
		this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS)
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null
			if (!this.started) return
			this.connect()
		}, delay)
	}

	private fanOut(event: Event): void {
		for (const { filter, callback } of this.subscribers.values()) {
			if (!this.options.matches(filter, event)) continue
			callback(event)
		}
	}

	private setConnected(next: boolean): void {
		if (this.connected === next) return
		this.connected = next
		for (const listener of this.connectionListeners) {
			listener(next)
		}
	}
}

function runIdForEvent(event: WorkspaceRunEvent): string | undefined {
	switch (event.type) {
		case 'run_event':
		case 'session_lifecycle':
		case 'run_stalled':
		case 'run_recovered':
			return event.run_id
		case 'issue_event':
			return undefined
		default: {
			const _exhaustive: never = event
			return _exhaustive
		}
	}
}

function workspaceMatches(filter: SubscriptionFilter, event: WorkspaceRunEvent): boolean {
	// Issue-scope events (SUP-81) have no `run_id` — a run-filter drops them,
	// a variant-filter on `issue_event` passes them.
	if (filter.runId && runIdForEvent(event) !== filter.runId) return false
	if (filter.variant && event.type !== filter.variant) return false
	return true
}

function launchTaskMatches(filter: LaunchTaskSubscriptionFilter, event: LaunchTaskEvent): boolean {
	if (filter.linearIssueId && event.linear_issue_id !== filter.linearIssueId) return false
	return true
}

export function createWorkspaceBroker(
	subscribe: SubscribeFn<WorkspaceRunEvent> = subscribeToWorkspaceEvents
): SseBroker<WorkspaceRunEvent, SubscriptionFilter> {
	return new SseBroker({ subscribe, matches: workspaceMatches, label: 'workspace-event-subscriber' })
}

export function createLaunchTaskBroker(
	subscribe: SubscribeFn<LaunchTaskEvent> = subscribeToLaunchTaskEvents
): SseBroker<LaunchTaskEvent, LaunchTaskSubscriptionFilter> {
	return new SseBroker({
		subscribe,
		matches: launchTaskMatches,
		label: 'launch-task-event-subscriber'
	})
}

export type WorkspaceEventBroker = SseBroker<WorkspaceRunEvent, SubscriptionFilter>
export type LaunchTaskEventBroker = SseBroker<LaunchTaskEvent, LaunchTaskSubscriptionFilter>

/** Process-wide instances — the shell provider calls `start()` on both. */
export const workspaceEventBroker: WorkspaceEventBroker = createWorkspaceBroker()
export const launchTaskEventBroker: LaunchTaskEventBroker = createLaunchTaskBroker()
