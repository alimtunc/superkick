/**
 * Shell-level workspace event integration (SUP-84 / SUP-123).
 *
 * Wraps the two `SseBroker` instances (workspace runs + launch tasks) in a
 * React provider, starts them on mount, and routes incoming notices through
 * pure invalidation handlers in `workspaceEvents.invalidation.ts`. Mounted
 * once at the app root so every page observes the same event streams.
 */

import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'

import { launchTaskEventBroker, workspaceEventBroker } from '@/lib/eventBroker'
import {
	invalidateForLaunchTaskNotice,
	invalidateForWorkspaceNotice
} from '@/lib/workspaceEvents.invalidation'
import type { SubscriptionFilter, WorkspaceRunEvent } from '@/types'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Mounts the shell brokers and wires Query invalidation. Render once above
 * `RouterProvider` so a) the brokers are alive before any route subscribes
 * and b) the `useQueryClient` hook resolves to the app-wide client.
 */
export function WorkspaceEventsProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient()

	useEffect(() => {
		workspaceEventBroker.start()
		const unsubscribe = workspaceEventBroker.subscribe({}, (notice) => {
			invalidateForWorkspaceNotice(queryClient, notice)
		})
		return () => {
			unsubscribe()
			// Deliberately do NOT stop the broker here: <StrictMode> double-mounts
			// this effect in dev, and closing the EventSource would thrash the
			// connection. The broker lives for the whole app.
		}
	}, [queryClient])

	useEffect(() => {
		launchTaskEventBroker.start()
		const unsubscribe = launchTaskEventBroker.subscribe({}, (notice) => {
			invalidateForLaunchTaskNotice(queryClient, notice)
		})
		return () => {
			unsubscribe()
			// Same StrictMode rationale as the workspace effect above — leave the
			// EventSource open for the lifetime of the app.
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
