import { useEffect, useReducer, useRef } from 'react'

import { workspaceEventBroker } from '@/lib/eventBroker'
import type { RunEvent } from '@/types'

const MAX_EVENTS = 500

interface EventStreamState {
	events: RunEvent[]
	connected: boolean
	done: boolean
}

type EventStreamAction = { type: 'event_received'; event: RunEvent }

function createInitialState(): EventStreamState {
	return { events: [], connected: true, done: false }
}

function reducer(state: EventStreamState, action: EventStreamAction): EventStreamState {
	const next = [...state.events, action.event]
	return { ...state, events: next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next }
}

/**
 * Stream of `RunEvent`s for a single run, backed by the shell-level
 * workspace broker (SUP-84). Previously this opened its own
 * `/runs/{id}/events` SSE connection per page mount — consolidating onto
 * the workspace substrate is what unlocks multi-run supervision without
 * N duplicate EventSources.
 *
 * The `connected`/`done` flags are retained for existing callers, but now
 * reflect the broker contract: the broker owns reconnection, so subscribers
 * are effectively always "connected" and never "done" (the broker itself
 * keeps trying). Consumers who cared about the stream ending on a terminal
 * run state should observe `run.state.is_terminal()` via the query cache
 * instead — that's the authoritative signal.
 */
export function useEventStream(runId: string, onStateChange?: () => void) {
	const [state, dispatch] = useReducer(reducer, undefined, createInitialState)
	const onStateChangeRef = useRef(onStateChange)
	onStateChangeRef.current = onStateChange

	useEffect(() => {
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

	return state
}
