import { describe, expect, it } from 'vitest'

import { parseIssuesSearch, resolveSearch } from './searchParams'

describe('parseIssuesSearch', () => {
	it('keeps view=list and view=board as-is', () => {
		expect(parseIssuesSearch({ view: 'list' }).view).toBe('list')
		expect(parseIssuesSearch({ view: 'board' }).view).toBe('board')
	})

	it('accepts empty params', () => {
		expect(parseIssuesSearch({})).toEqual({})
	})

	it('coerces priority numbers from strings', () => {
		const parsed = parseIssuesSearch({ priority: ['1', '3'] })
		expect(parsed.priority).toEqual([1, 3])
	})

	it('rejects priorities outside 0..4', () => {
		expect(() => parseIssuesSearch({ priority: [5] })).toThrow()
	})
})

describe('resolveSearch', () => {
	it('defaults tab to mine when viewerId is present', () => {
		expect(resolveSearch({}, 'viewer-1').tab).toBe('mine')
	})

	it('falls back to all-open when viewerId is null', () => {
		expect(resolveSearch({}, null).tab).toBe('all-open')
	})

	it('honours an explicit tab', () => {
		expect(resolveSearch({ tab: 'shipped' }, 'viewer-1').tab).toBe('shipped')
	})

	it('defaults group to status and sort to priority for the Linear-like issues baseline', () => {
		const r = resolveSearch({}, 'viewer-1')
		expect(r.group).toBe('status')
		expect(r.sort).toBe('priority')
	})

	it('returns empty filter arrays when none are set', () => {
		const r = resolveSearch({}, null)
		expect(r.filters.assignee).toEqual([])
		expect(r.filters.priority).toEqual([])
	})

	it('passes filter arrays through', () => {
		const r = resolveSearch({ assignee: ['u-1'], priority: [1] }, 'viewer-1')
		expect(r.filters.assignee).toEqual(['u-1'])
		expect(r.filters.priority).toEqual([1])
	})
})
