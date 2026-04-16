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

import { useEffect, useRef } from 'react'

import { workspaceEventBroker } from '@/lib/eventBroker'
import { queryKeys } from '@/lib/queryKeys'
import type { BrokerNotice, RunEvent, SubscriptionFilter, WorkspaceRunEvent } from '@/types'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Kinds that indicate state mutations the run detail query cares about.
 * Keeping this list narrow avoids invalidating on every `agent_output` line
 * — which would defeat the point of a query cache.
 */
const RUN_DETAIL_INVALIDATING_KINDS: ReadonlySet<RunEvent['kind']> = new Set([
	'state_change',
	'step_started',
	'step_completed',
	'step_failed',
	'interrupt_created',
	'interrupt_resolved',
	'attention_requested',
	'attention_replied',
	'attention_cancelled',
	'ownership_taken_over',
	'ownership_released',
	'ownership_suspended',
	'ownership_resumed',
	'review_completed',
	'handoff_created',
	'handoff_completed',
	'handoff_failed',
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
export function WorkspaceEventsProvider({ children }: { children: React.ReactNode }) {
	const queryClient = useQueryClient()

	useEffect(() => {
		workspaceEventBroker.start()

		const unsubscribe = workspaceEventBroker.subscribe({}, (notice: BrokerNotice) => {
			if (notice.type === 'lagged') {
				// We missed events — any cached run detail might be stale.
				queryClient.invalidateQueries({ queryKey: queryKeys.runs.all })
				return
			}

			if (notice.type === 'run_event') {
				if (RUN_DETAIL_INVALIDATING_KINDS.has(notice.kind)) {
					queryClient.invalidateQueries({
						queryKey: queryKeys.runs.detail(notice.run_id)
					})
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
