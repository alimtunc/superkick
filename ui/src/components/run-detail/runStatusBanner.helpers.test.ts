import type { Run } from '@/types'
import { describe, expect, it } from 'vitest'

import { shipSummary } from './runStatusBanner.helpers'

function run(overrides: Partial<Run>): Run {
	return { state: 'failed', error_message: null, ...overrides } as Run
}

// A liveness-reconciled orphan lands in `failed` with `error_message` set to the
// reconciliation reason; the terminal banner must surface that reason so the
// operator sees why the run stopped, not a generic failure.
describe('shipSummary', () => {
	it('surfaces the reconciliation reason for a failed run', () => {
		const reason = 'launch task orphaned — no live executor (server restart); reconciled to Failed'
		expect(shipSummary(run({ state: 'failed', error_message: reason }))).toBe(reason)
	})

	it('falls back to a generic message when no reason is recorded', () => {
		expect(shipSummary(run({ state: 'failed', error_message: null }))).toBe('Run failed.')
	})

	it('reports a cancelled run distinctly', () => {
		expect(shipSummary(run({ state: 'cancelled' }))).toBe('Run was cancelled.')
	})
})
