import { useEffect, useMemo, useReducer, useRef } from 'react'

import { workspaceEventBroker } from '@/lib/eventBroker'
import { runEventsQuery } from '@/lib/queries'
import type { RunEvent } from '@/types'
import { useQuery } from '@tanstack/react-query'

const MAX_EVENTS = 500

interface EventStreamState {
	events: RunEvent[]
}

type EventStreamAction =
	| { type: 'event_received'; event: RunEvent }
	| { type: 'backfill'; events: RunEvent[] }
	| { type: 'reset' }

function createInitialState(): EventStreamState {
	return { events: [] }
}

function isInitialState(state: EventStreamState): boolean {
	return state.events.length === 0
}

export function appendRunEvent(events: RunEvent[], event: RunEvent): RunEvent[] {
	if (events.some((existing) => existing.id === event.id)) return events
	const next = [...events, event]
	return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next
}

// Live broker events and DB rows share `id`, so dedup-by-id is safe.
export function mergeRunEvents(base: RunEvent[], incoming: RunEvent[]): RunEvent[] {
	const seen = new Set(base.map((event) => event.id))
	const merged = [...base]
	for (const event of incoming) {
		if (seen.has(event.id)) continue
		seen.add(event.id)
		merged.push(event)
	}
	merged.sort((a, b) => a.ts.localeCompare(b.ts))
	return merged.length > MAX_EVENTS ? merged.slice(-MAX_EVENTS) : merged
}

export function eventStreamReducer(state: EventStreamState, action: EventStreamAction): EventStreamState {
	switch (action.type) {
		case 'event_received':
			return { ...state, events: appendRunEvent(state.events, action.event) }
		case 'backfill':
			return { ...state, events: mergeRunEvents(state.events, action.events) }
		case 'reset':
			return isInitialState(state) ? state : createInitialState()
	}
}

// Backfills the persisted log on mount; the broker bus only delivers events
// published after subscription.
export function useEventStream(runId: string | null | undefined, onStateChange?: () => void) {
	const [state, dispatch] = useReducer(eventStreamReducer, undefined, createInitialState)
	const onStateChangeRef = useRef(onStateChange)
	onStateChangeRef.current = onStateChange

	const backfill = useQuery(runEventsQuery(runId ?? null))
	const backfillEvents = backfill.data

	useEffect(() => {
		if (!backfillEvents) return
		dispatch({ type: 'backfill', events: backfillEvents })
	}, [backfillEvents])

	useEffect(() => {
		dispatch({ type: 'reset' })
		if (!runId) return
		workspaceEventBroker.start()
		const unsubscribe = workspaceEventBroker.subscribe({ runId, variant: 'run_event' }, (notice) => {
			if (notice.type !== 'run_event') return
			dispatch({ type: 'event_received', event: notice })
			if (
				notice.kind === 'state_change' ||
				notice.kind === 'step_started' ||
				notice.kind === 'step_completed' ||
				notice.kind === 'interrupt_created' ||
				notice.kind === 'budget_tripped' ||
				notice.kind === 'approval_gate_entered'
			) {
				onStateChangeRef.current?.()
			}
		})
		return unsubscribe
	}, [runId])

	return useMemo(() => ({ events: state.events }), [state.events])
}
