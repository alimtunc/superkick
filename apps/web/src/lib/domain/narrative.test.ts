import type { RunState } from '@/types'
import { describe, expect, it } from 'vitest'

import { runNarrative, toneDotClass } from './narrative'

// The run-detail "live" indicator is `toneDotClass[narrative.tone]`, where
// `live-pulse` is the animated dot. Reconciling a dead run to a terminal
// RunState must stop the pulse — these pins guard against that regressing.
const isLive = (state: RunState) => toneDotClass[runNarrative(state).tone].includes('live-pulse')

describe('runNarrative live indicator', () => {
	it('marks an in-progress run as live (pulsing dot)', () => {
		expect(isLive('planning')).toBe(true)
		expect(isLive('coding')).toBe(true)
		expect(isLive('reviewing')).toBe(true)
	})

	it('stops marking a reconciled / terminal run as live', () => {
		expect(isLive('failed')).toBe(false)
		expect(isLive('cancelled')).toBe(false)
		expect(isLive('completed')).toBe(false)
	})
})
