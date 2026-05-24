import { describe, expect, it } from 'vitest'

import { CAPTURE_STATES, findStates } from './manifest.mjs'

const SUP_170_STATES = [
	'issues-list-default',
	'issues-list-hover',
	'issues-list-filter',
	'issues-list-empty',
	'issues-list-loading',
	'issues-list-shipped',
	'issues-kanban-default',
	'issues-kanban-drag',
	'issue-detail-idle',
	'issue-detail-running',
	'issue-detail-diff'
]

describe('SUP-170 visual parity manifest', () => {
	it('covers every approved dark issues artboard targeted by the ticket', () => {
		const ids = new Set(CAPTURE_STATES.map((state) => state.id))

		for (const id of SUP_170_STATES) {
			expect(ids.has(id), `${id} should be configured`).toBe(true)
		}
	})

	it('can resolve the full SUP-170 state set for focused capture', () => {
		expect(findStates(SUP_170_STATES).map((state) => state.id)).toEqual(SUP_170_STATES)
	})
})
