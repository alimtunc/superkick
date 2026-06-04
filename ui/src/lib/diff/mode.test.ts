import { describe, expect, it } from 'vitest'

import { effectiveDiffMode } from './mode'

describe('effectiveDiffMode', () => {
	it('keeps unified as unified regardless of deletions', () => {
		expect(effectiveDiffMode('unified', 0)).toBe('unified')
		expect(effectiveDiffMode('unified', 10)).toBe('unified')
	})

	it('honors split when the file has deletions', () => {
		expect(effectiveDiffMode('split', 3)).toBe('split')
	})

	it('falls back to unified for split when there are no deletions', () => {
		expect(effectiveDiffMode('split', 0)).toBe('unified')
	})
})
