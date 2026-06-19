import { describe, expect, it } from 'vitest'

import { snippetSegments, splitHighlight } from './highlightSnippet'

describe('splitHighlight', () => {
	it('returns one text segment when query is empty', () => {
		expect(splitHighlight('hello', '')).toEqual([{ type: 'text', value: 'hello' }])
	})

	it('returns one text segment when query is absent', () => {
		expect(splitHighlight('hello', 'xyz')).toEqual([{ type: 'text', value: 'hello' }])
	})

	it('marks the match case-insensitively', () => {
		expect(splitHighlight('Hello World', 'world')).toEqual([
			{ type: 'text', value: 'Hello ' },
			{ type: 'mark', value: 'World' }
		])
	})

	it('handles match at start', () => {
		expect(splitHighlight('abcdef', 'abc')).toEqual([
			{ type: 'mark', value: 'abc' },
			{ type: 'text', value: 'def' }
		])
	})
})

describe('snippetSegments', () => {
	it('returns one text segment when range is invalid', () => {
		expect(snippetSegments('hello', 4, 2)).toEqual([{ type: 'text', value: 'hello' }])
		expect(snippetSegments('hello', -1, 2)).toEqual([{ type: 'text', value: 'hello' }])
		expect(snippetSegments('hello', 0, 99)).toEqual([{ type: 'text', value: 'hello' }])
	})

	it('splits on byte offsets', () => {
		expect(snippetSegments('foobarbaz', 3, 6)).toEqual([
			{ type: 'text', value: 'foo' },
			{ type: 'mark', value: 'bar' },
			{ type: 'text', value: 'baz' }
		])
	})

	it('handles match at start of snippet', () => {
		expect(snippetSegments('abc…', 0, 3)).toEqual([
			{ type: 'mark', value: 'abc' },
			{ type: 'text', value: '…' }
		])
	})
})
