/**
 * Shell-level workspace event integration (SUP-84).
 *
 * Wraps the `WorkspaceEventBroker` in a React provider and exposes hooks
 * that consume it. Mounted once at the app root so every page, shell
 * surface, and zustand-connected rail observes the same event stream.
 *
 * Responsibilities:
 *   - start the broker on mount, stop on unmount (full app teardown)
 *   - invalidate the right TanStack Query keys on every event, so
 *     per-page data stays fresh without each page opening its own SSE
 *   - surface `useWorkspaceRunEvents` for ad-hoc subscribers (watched
 *     session rails, attention counters, replacement for `useEventStream`)
 */

import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'

import { workspaceEventBroker } from '@/lib/eventBroker'
import { queryKeys } from '@/lib/queryKeys'
import type { BrokerNotice, RunEvent, SubscriptionFilter, WorkspaceRunEvent } from '@/types'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Event kinds that can shift a run into a different operator queue bucket
 * (SUP-58). Narrower than `RUN_DETAIL_INVALIDATING_KINDS` because step
 * progress within the same state doesn't move a run between columns.
 */
const QUEUE_INVALIDATING_KINDS: ReadonlySet<RunEvent['kind']> = new Set([
	'state_change',
	'interrupt_created',
	'interrupt_resolved',
	'attention_requested',
	'attention_replied',
	'attention_cancelled',
	'ownership_suspended',
	'ownership_resumed',
	'ownership_taken_over',
	'ownership_released',
	'handoff_created',
	'handoff_completed',
	'handoff_failed'
])

/**
 * Kinds that indicate state mutations the run detail query cares about.
 * Superset of `QUEUE_INVALIDATING_KINDS`: every bucket-shifting signal is also
 * relevant to the detail view, plus per-step progress and session lifecycle
 * events that don't move a run between columns. Kept narrow so we don't
 * invalidate on every `agent_output` line — that would defeat the cache.
 */
const RUN_DETAIL_INVALIDATING_KINDS: ReadonlySet<RunEvent['kind']> = new Set<RunEvent['kind']>([
	...QUEUE_INVALIDATING_KINDS,
	'step_started',
	'step_completed',
	'step_failed',
	'review_completed',
	'session_spawned',
	'session_completed',
	'session_failed',
	'session_cancelled'
])

/**
 * Mounts the shell broker and wires Query invalidation. Render once above
 * `RouterProvider` so a) the broker is alive before any route subscribes
 * and b) the `useQueryClient` hook resolves to the app-wide client.
 */
export function WorkspaceEventsProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient()

	useEffect(() => {
		workspaceEventBroker.start()

		const unsubscribe = workspaceEventBroker.subscribe({}, (notice: BrokerNotice) => {
			if (notice.type === 'lagged') {
				// We missed events — any cached run detail might be stale.
				queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
				queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.queue })
				return
			}

			if (notice.type === 'run_event') {
				if (RUN_DETAIL_INVALIDATING_KINDS.has(notice.kind)) {
					queryClient.invalidateQueries({
						queryKey: queryKeys.runs.detail(notice.run_id)
					})
				}
				// The operator queue depends on state, attention, interrupts,
				// ownership, and PR status — every invalidating kind above is
				// a bucket-shifting signal.
				if (QUEUE_INVALIDATING_KINDS.has(notice.kind)) {
					queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.queue })
				}
				if (notice.kind === 'state_change') {
					// A run transitioned — the runs list state (and any
					// dashboard summary) needs a refresh.
					queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
				}
				return
			}

			if (notice.type === 'session_lifecycle') {
				queryClient.invalidateQueries({
					queryKey: queryKeys.runs.detail(notice.run_id)
				})
				queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.queue })
			}

			// SUP-73 — recovery scheduler annotated a run as stalled or
			// recovered. Refresh the queue (badge in/out on the card) AND the
			// detail view (RunDetail surfaces the same annotation, and the
			// operator may be staring at it when the transition fires).
			if (notice.type === 'run_stalled' || notice.type === 'run_recovered') {
				queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.queue })
				queryClient.invalidateQueries({
					queryKey: queryKeys.runs.detail(notice.run_id)
				})
				return
			}
		})

		return () => {
			unsubscribe()
			// Deliberately do NOT stop the broker here: <StrictMode> double-
			// mounts this effect in dev, and closing the EventSource would
			// thrash the connection. The broker lives for the whole app.
		}
	}, [queryClient])

	return <>{children}</>
}

/**
 * Subscribe to workspace events from any component. The filter's primitive
 * fields drive the effect's dependency array so callers can pass an inline
 * object without triggering a resubscribe every render; the callback is
 * read from a ref, so it does not need to be memoised by the caller.
 */
export function useWorkspaceRunEvents(
	filter: SubscriptionFilter,
	callback: (event: WorkspaceRunEvent) => void
): void {
	const callbackRef = useRef(callback)
	callbackRef.current = callback
	const runId = filter.runId
	const variant = filter.variant

	useEffect(() => {
		return workspaceEventBroker.subscribe({ runId, variant }, (notice) => {
			if (notice.type === 'lagged') return
			callbackRef.current(notice)
		})
	}, [runId, variant])
}
