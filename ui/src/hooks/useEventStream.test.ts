import type { RunEvent } from '@/types'
import { describe, expect, it } from 'vitest'

import { appendRunEvent } from './useEventStream'

function event(id: string): RunEvent {
	return {
		id,
		run_id: 'run-1',
		run_step_id: 'step-1',
		ts: '2026-05-24T14:00:00.000Z',
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
