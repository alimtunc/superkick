import { describe, expect, it } from 'vitest'

import { CAPTURE_STATES, ISSUE_DETAIL_TITLE, findStates } from './manifest.mjs'

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

const DRAWER_STATES = [
	'drawer-activity',
	'drawer-tools',
	'drawer-files',
	'drawer-logs',
	'drawer-terminal',
	'drawer-done'
]

const STATES_BY_ID = new Map(CAPTURE_STATES.map((state) => [state.id, state]))

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

describe('SUP-175 visual parity manifest cleanup', () => {
	it('flags issue-detail-diff as a manual checklist with a reviewer-facing reason', () => {
		const state = STATES_BY_ID.get('issue-detail-diff')
		expect(state, 'issue-detail-diff state should exist').toBeDefined()
		expect(typeof state?.manualChecklist).toBe('string')
		expect(state?.manualChecklist).toMatch(/checklist|not a product screen|pixel/i)
	})

	it('keeps issue-detail-idle and issue-detail-running screenshot-comparable (no manualChecklist flag)', () => {
		for (const id of ['issue-detail-idle', 'issue-detail-running']) {
			expect(
				STATES_BY_ID.get(id)?.manualChecklist,
				`${id} must not be flagged as a manual checklist`
			).toBeFalsy()
		}
	})

	it('points the hover state at the approved artboard target (ISS-216)', () => {
		const state = STATES_BY_ID.get('issues-list-hover')
		expect(state?.actions).toEqual([{ type: 'hoverIssue', identifier: 'ISS-216' }])
		expect(state?.waitFor).toContain('ISS-216')
		expect(typeof state?.fixtureNote).toBe('string')
	})

	it('waits on a real production anchor (issue title) for every drawer state, never the stale "Execution" label', () => {
		for (const id of DRAWER_STATES) {
			const state = STATES_BY_ID.get(id)
			expect(state, `${id} should exist`).toBeDefined()
			expect(state?.waitForText, `${id} must wait on a real anchor`).toBe(ISSUE_DETAIL_TITLE)
			expect(state?.waitForText, `${id} must not wait on stale Execution text`).not.toBe('Execution')
		}
	})
})
