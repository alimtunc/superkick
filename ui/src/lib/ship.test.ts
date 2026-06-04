import type { WorkflowStateOption } from '@/types'
import { describe, expect, it } from 'vitest'

import { composeShipBody, resolveLinearStatusStateId } from './ship'

describe('composeShipBody', () => {
	it('includes summary and changed files when toggled on', () => {
		const body = composeShipBody({
			includeSummary: true,
			includeChangedFiles: true,
			summary: 'Implemented the thing',
			changedFiles: ['src/a.ts', 'src/b.ts']
		})
		expect(body).toContain('Implemented the thing')
		expect(body).toContain('### Changed files')
		expect(body).toContain('- `src/a.ts`')
		expect(body).toContain('- `src/b.ts`')
	})

	it('omits each section when its toggle is off', () => {
		expect(
			composeShipBody({
				includeSummary: false,
				includeChangedFiles: true,
				summary: 'x',
				changedFiles: ['a']
			})
		).not.toContain('x')
		expect(
			composeShipBody({
				includeSummary: true,
				includeChangedFiles: false,
				summary: 'x',
				changedFiles: ['a']
			})
		).not.toContain('### Changed files')
	})

	it('never fabricates: empty sources yield an empty body', () => {
		expect(
			composeShipBody({
				includeSummary: true,
				includeChangedFiles: true,
				summary: '   ',
				changedFiles: []
			})
		).toBe('')
	})
})

const states: WorkflowStateOption[] = [
	{ id: 's-prog', name: 'In Progress', state_type: 'started', color: '#fff', position: 1 },
	{ id: 's-rev', name: 'In Review', state_type: 'started', color: '#fff', position: 2 },
	{ id: 's-done', name: 'Done', state_type: 'completed', color: '#fff', position: 3 }
]

describe('resolveLinearStatusStateId', () => {
	it('returns null for no_change', () => {
		expect(resolveLinearStatusStateId(states, 'no_change')).toBeNull()
	})

	it('resolves In Review to the started lane named ~review, not the lowest started lane', () => {
		expect(resolveLinearStatusStateId(states, 'in_review')).toBe('s-rev')
	})

	it('resolves Done to the completed lane', () => {
		expect(resolveLinearStatusStateId(states, 'done')).toBe('s-done')
	})

	it('returns null when no matching lane exists', () => {
		const noReview: WorkflowStateOption[] = [states[0], states[2]]
		expect(resolveLinearStatusStateId(noReview, 'in_review')).toBeNull()
		expect(resolveLinearStatusStateId([states[0], states[1]], 'done')).toBeNull()
	})
})
