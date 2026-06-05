import { describe, expect, it } from 'vitest'

import { langCases } from './__fixtures__/langCases'
import { langFromPath } from './lang'

describe('langFromPath fixture cases', () => {
	it.each(langCases)('maps $path to $lang', ({ path, lang }) => {
		expect(langFromPath(path)).toBe(lang)
	})
})
