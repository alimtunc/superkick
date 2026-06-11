import { describe, expect, it } from 'vitest'

import { validateHeadBranch } from './shipBranch'

describe('validateHeadBranch', () => {
	it('accepts well-formed branch names', () => {
		expect(validateHeadBranch('feat/sup-200')).toBeNull()
		expect(validateHeadBranch('fix-thing')).toBeNull()
		expect(validateHeadBranch('codex/smooth-issues-ux')).toBeNull()
		expect(validateHeadBranch('release/v1.2.3')).toBeNull()
	})

	it('rejects an empty name', () => {
		expect(validateHeadBranch('')).toBe('Head branch is required')
	})

	it('rejects spaces and whitespace', () => {
		expect(validateHeadBranch('my branch')).toBe('Branch names cannot contain spaces')
		expect(validateHeadBranch('a\tb')).toBe('Branch names cannot contain control characters')
	})

	it('rejects control characters', () => {
		expect(validateHeadBranch('a\u0007b')).toBe('Branch names cannot contain control characters')
		expect(validateHeadBranch('a\u007fb')).toBe('Branch names cannot contain control characters')
	})

	it.each(['~', '^', ':', '?', '*', '[', '\\'])('rejects "%s"', (char) => {
		expect(validateHeadBranch(`feat${char}name`)).toBe(`Branch names cannot contain "${char}"`)
	})

	it('rejects ".."', () => {
		expect(validateHeadBranch('a..b')).toBe('Branch names cannot contain ".."')
	})

	it('rejects "@{"', () => {
		expect(validateHeadBranch('a@{b')).toBe('Branch names cannot contain "@{"')
	})

	it('rejects "//"', () => {
		expect(validateHeadBranch('a//b')).toBe('Branch names cannot contain "//"')
	})

	it('rejects leading or trailing "/"', () => {
		expect(validateHeadBranch('/foo')).toBe('Branch names cannot start or end with "/"')
		expect(validateHeadBranch('foo/')).toBe('Branch names cannot start or end with "/"')
	})

	it('rejects leading or trailing "."', () => {
		expect(validateHeadBranch('.foo')).toBe('Branch names cannot start or end with "."')
		expect(validateHeadBranch('foo.')).toBe('Branch names cannot start or end with "."')
	})

	it('rejects names ending in ".lock"', () => {
		expect(validateHeadBranch('foo.lock')).toBe('Branch names cannot end with ".lock"')
	})

	it('rejects a bare "@"', () => {
		expect(validateHeadBranch('@')).toBe('Branch name cannot be "@"')
	})

	it('rejects a leading "-"', () => {
		expect(validateHeadBranch('-foo')).toBe('Branch names cannot start with "-"')
	})

	it('rejects segments starting with "."', () => {
		expect(validateHeadBranch('feat/.hidden')).toBe('Branch name segments cannot start with "."')
	})

	it('rejects segments ending in ".lock"', () => {
		expect(validateHeadBranch('feat.lock/sub')).toBe('Branch name segments cannot end with ".lock"')
	})
})
