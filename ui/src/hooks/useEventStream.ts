import { useEffect, useReducer } from 'react'

import { subscribeToRunEvents } from '@/api'
import type { RunEvent } from '@/types'

const MAX_EVENTS = 500

interface EventStreamState {
	events: RunEvent[]
	connected: boolean
	done: boolean
}

type EventStreamAction =
	| { type: 'event_received'; event: RunEvent }
	| { type: 'stream_done' }
	| { type: 'stream_error' }

function createInitialState(): EventStreamState {
	return { events: [], connected: true, done: false }
}

function reducer(state: EventStreamState, action: EventStreamAction): EventStreamState {
	switch (action.type) {
		case 'event_received': {
			const next = [...state.events, action.event]
			return { ...state, events: next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next }
		}
		case 'stream_done':
			return { ...state, connected: false, done: true }
		case 'stream_error':
			return { ...state, connected: false }
	}
}

export function useEventStream(runId: string, onStateChange?: () => void) {
	const [state, dispatch] = useReducer(reducer, undefined, createInitialState)

	useEffect(() => {
		return subscribeToRunEvents(
			runId,
			(event) => {
				dispatch({ type: 'event_received', event })
				if (
					event.kind === 'state_change' ||
					event.kind === 'step_started' ||
					event.kind === 'step_completed' ||
					event.kind === 'interrupt_created'
				) {
					onStateChange?.()
				}
			},
			() => dispatch({ type: 'stream_done' }),
			() => dispatch({ type: 'stream_error' })
		)
	}, [runId, onStateChange])

	return state
}
