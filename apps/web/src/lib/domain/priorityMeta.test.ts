import { describe, expect, it } from 'vitest'

import { priorityIconKindFromValue } from './priorityMeta'

describe('priorityIconKindFromValue', () => {
	it.each([
		[0, 'none'],
		[1, 'urgent'],
		[2, 'high'],
		[3, 'medium'],
		[4, 'low']
	] as const)('maps Linear priority %i to %s', (value, expected) => {
		expect(priorityIconKindFromValue(value)).toBe(expected)
	})

	it('falls back to none for unknown values', () => {
		expect(priorityIconKindFromValue(99)).toBe('none')
	})
})
