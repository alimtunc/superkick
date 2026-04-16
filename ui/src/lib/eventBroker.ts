/**
 * Shell-level workspace event broker (SUP-84).
 *
 * Owns the single `EventSource` to `GET /api/events` for the whole app. Any
 * hook, page, or store that needs live run events subscribes through this
 * broker instead of opening its own SSE connection. That keeps the number of
 * open streams at exactly one regardless of how many runs the operator is
 * watching — a precondition for honest multi-run supervision.
 *
 * The broker is deliberately transport-agnostic at the call-site API level:
 * subscribers pass a filter + callback and receive events, they never touch
 * the underlying EventSource.
 *
 * Lifecycle:
 *   - `start()` opens the stream (idempotent; safe to call from a React
 *     effect in the shell mount).
 *   - On `error`/close, exponential-backoff reconnect up to a cap.
 *   - On `lagged`, the broker emits a synthetic `{ type: 'lagged' }` event
 *     so subscribers (or the query-invalidation wiring below) can reconcile
 *     by refetching the affected runs.
 *   - `stop()` closes the stream and drops every subscriber — call only on
 *     full app teardown.
 */

import { subscribeToWorkspaceEvents } from '@/api'
import type {
	BrokerNotice,
	LaggedNotice,
	SubscriptionFilter,
	WorkspaceEventSubscriber,
	WorkspaceRunEvent
} from '@/types'

interface SubscriberEntry {
	filter: SubscriptionFilter
	callback: WorkspaceEventSubscriber
}

const RECONNECT_MIN_MS = 500
const RECONNECT_MAX_MS = 10_000

export class WorkspaceEventBroker {
	private subscribers = new Map<symbol, SubscriberEntry>()
	private stopStream: (() => void) | null = null
	private started = false
	private reconnectDelay = RECONNECT_MIN_MS
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null

	/**
	 * Open the stream. Idempotent — subsequent calls are no-ops while a
	 * connection is live.
	 */
	start(): void {
		if (this.started) return
		this.started = true
		this.connect()
	}

	/**
	 * Close the stream and drop every subscriber. Only call this on full
	 * teardown — per-subscriber cleanup is handled by the `unsubscribe`
	 * return value of `subscribe()`.
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
	}

	/**
	 * Register a subscriber. Returns an unsubscribe function. The broker
	 * keeps the stream open as long as it was started via `start()` — it
	 * does not reference-count subscribers.
	 */
	subscribe(filter: SubscriptionFilter, callback: WorkspaceEventSubscriber): () => void {
		const key = Symbol('workspace-event-subscriber')
		this.subscribers.set(key, { filter, callback })
		return () => {
			this.subscribers.delete(key)
		}
	}

	private connect(): void {
		this.stopStream = subscribeToWorkspaceEvents({
			onEvent: (event) => {
				this.reconnectDelay = RECONNECT_MIN_MS
				this.fanOut(event)
			},
			onLagged: (skipped) => {
				const notice: LaggedNotice = { type: 'lagged', skipped }
				// Broadcast to every subscriber — consumers decide whether
				// to refetch. Filters do not apply to lag notices because
				// any subscriber may have missed events for any run.
				const laggedNotice: BrokerNotice = notice
				for (const { callback } of this.subscribers.values()) {
					callback(laggedNotice)
				}
			},
			onClosed: () => {
				this.stopStream = null
				this.scheduleReconnect()
			},
			onError: () => {
				this.stopStream = null
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

	private fanOut(event: WorkspaceRunEvent): void {
		for (const { filter, callback } of this.subscribers.values()) {
			if (filter.runId && event.run_id !== filter.runId) continue
			if (filter.variant && event.type !== filter.variant) continue
			callback(event)
		}
	}
}

/**
 * Process-wide broker instance. The shell provider calls `start()`; there
 * is only ever one EventSource open.
 */
export const workspaceEventBroker = new WorkspaceEventBroker()
