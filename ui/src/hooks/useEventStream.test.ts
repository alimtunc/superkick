import type { RunEvent } from '@/types'
import { describe, expect, it } from 'vitest'

import { appendRunEvent, eventStreamReducer, mergeRunEvents } from './useEventStream'

function event(id: string, ts = '2026-05-24T14:00:00.000Z'): RunEvent {
	return {
		id,
		run_id: 'run-1',
		run_step_id: 'step-1',
		ts,
		kind: 'step_started',
		level: 'info',
		message: 'Code step started',
		payload_json: { step_key: 'code' }
	}
}

describe('appendRunEvent', () => {
	it('does not append an event id that is already present', () => {
		const first = event('event-1')
		const result = appendRunEvent([first], event('event-1'))

		expect(result).toEqual([first])
	})
})

describe('mergeRunEvents', () => {
	it('interleaves backfill rows into live events in chronological order', () => {
		const live = [event('live-late', '2026-05-24T14:05:00.000Z')]
		const backfill = [
			event('hist-1', '2026-05-24T14:00:00.000Z'),
			event('hist-2', '2026-05-24T14:02:00.000Z')
		]

		const merged = mergeRunEvents(live, backfill)

		expect(merged.map((e) => e.id)).toEqual(['hist-1', 'hist-2', 'live-late'])
	})

	it('keeps an event that exists in both streams exactly once', () => {
		const shared = event('shared', '2026-05-24T14:00:00.000Z')
		const live = [shared]
		const backfill = [shared, event('hist', '2026-05-24T13:59:00.000Z')]

		const merged = mergeRunEvents(live, backfill)

		expect(merged).toHaveLength(2)
		expect(merged.map((e) => e.id)).toEqual(['hist', 'shared'])
	})
})

describe('eventStreamReducer — reset', () => {
	it('clears accumulated events so a runId change does not leak prior run history', () => {
		const populated = { events: [event('a'), event('b')], connected: true, done: false }

		const next = eventStreamReducer(populated, { type: 'reset' })

		expect(next.events).toEqual([])
	})

	it('returns the same state identity when already at the initial state', () => {
		const initial = { events: [], connected: true, done: false }

		const next = eventStreamReducer(initial, { type: 'reset' })

		expect(next).toBe(initial)
	})
})
