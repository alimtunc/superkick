import { describe, expect, it } from 'vitest'

import { parseCommandPrefix } from './commandPrefix'

describe('parseCommandPrefix', () => {
	it('returns null scope when no prefix', () => {
		expect(parseCommandPrefix('hello')).toEqual({ scope: null, rest: 'hello' })
	})

	it('parses i: prefix', () => {
		expect(parseCommandPrefix('i:webhook')).toEqual({ scope: 'issues', rest: 'webhook' })
	})

	it('parses c: prefix', () => {
		expect(parseCommandPrefix('c: retry')).toEqual({ scope: 'comments', rest: 'retry' })
	})

	it('parses f: prefix', () => {
		expect(parseCommandPrefix('f:src/lib')).toEqual({ scope: 'files', rest: 'src/lib' })
	})

	it('parses r: prefix', () => {
		expect(parseCommandPrefix('r:run-7af2')).toEqual({ scope: 'runs', rest: 'run-7af2' })
	})

	it('is case insensitive on the prefix letter', () => {
		expect(parseCommandPrefix('I:foo')).toEqual({ scope: 'issues', rest: 'foo' })
	})

	it('rejects unknown prefixes', () => {
		expect(parseCommandPrefix('x:foo')).toEqual({ scope: null, rest: 'x:foo' })
	})

	it('handles empty input', () => {
		expect(parseCommandPrefix('')).toEqual({ scope: null, rest: '' })
	})
})
