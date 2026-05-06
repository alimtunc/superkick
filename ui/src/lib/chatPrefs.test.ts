import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readChatPrefs, writeChatPrefs } from './chatPrefs'

const KEY = 'issue:SUP-1'
const STORAGE_PREFIX = 'superkick.chat.prefs.'

// jsdom 29 ships with a broken localStorage when no `--localstorage-file` is
// configured (`setItem` is absent on the binding). Install a minimal in-memory
// `Storage` for each test so we exercise the real read/write path.
function installLocalStorage(): Storage {
	const data = new Map<string, string>()
	const stub: Storage = {
		get length() {
			return data.size
		},
		key(i) {
			return Array.from(data.keys())[i] ?? null
		},
		getItem(k) {
			return data.has(k) ? (data.get(k) ?? null) : null
		},
		setItem(k, v) {
			data.set(k, String(v))
		},
		removeItem(k) {
			data.delete(k)
		},
		clear() {
			data.clear()
		}
	}
	Object.defineProperty(window, 'localStorage', {
		value: stub,
		configurable: true,
		writable: true
	})
	return stub
}

function uninstallLocalStorage() {
	Object.defineProperty(window, 'localStorage', {
		value: undefined,
		configurable: true,
		writable: true
	})
}

describe('chatPrefs — read/write round-trip', () => {
	beforeEach(installLocalStorage)
	afterEach(uninstallLocalStorage)

	it('returns {} when nothing is stored', () => {
		expect(readChatPrefs(KEY)).toEqual({})
	})

	it('round-trips a mode-only write', () => {
		writeChatPrefs(KEY, { mode: 'plan_mode' })
		expect(readChatPrefs(KEY)).toEqual({ mode: 'plan_mode' })
	})

	it('round-trips a model-only write, including the explicit null choice', () => {
		writeChatPrefs(KEY, { model: 'opus-4.7' })
		expect(readChatPrefs(KEY)).toEqual({ model: 'opus-4.7' })
		writeChatPrefs(KEY, { model: null })
		expect(readChatPrefs(KEY)).toEqual({ model: null })
	})

	it('merges partial writes, preserving the untouched field', () => {
		writeChatPrefs(KEY, { mode: 'auto_mode' })
		writeChatPrefs(KEY, { model: 'sonnet-4.6' })
		expect(readChatPrefs(KEY)).toEqual({ mode: 'auto_mode', model: 'sonnet-4.6' })
	})

	it('keeps subjects isolated from each other', () => {
		writeChatPrefs('issue:SUP-1', { mode: 'plan_mode' })
		writeChatPrefs('issue:SUP-2', { mode: 'ask_before_edits' })
		expect(readChatPrefs('issue:SUP-1')).toEqual({ mode: 'plan_mode' })
		expect(readChatPrefs('issue:SUP-2')).toEqual({ mode: 'ask_before_edits' })
	})
})

describe('chatPrefs — sanitisation', () => {
	let storage: Storage

	beforeEach(() => {
		storage = installLocalStorage()
	})
	afterEach(uninstallLocalStorage)

	it('drops an unknown mode value (corrupted / removed enum variant)', () => {
		storage.setItem(STORAGE_PREFIX + KEY, JSON.stringify({ mode: 'old_removed_mode', model: 'opus-4.7' }))
		expect(readChatPrefs(KEY)).toEqual({ model: 'opus-4.7' })
	})

	it('drops a non-string, non-null model', () => {
		storage.setItem(STORAGE_PREFIX + KEY, JSON.stringify({ mode: 'plan_mode', model: 42 }))
		expect(readChatPrefs(KEY)).toEqual({ mode: 'plan_mode' })
	})

	it('returns {} when the stored payload is not an object', () => {
		storage.setItem(STORAGE_PREFIX + KEY, JSON.stringify('hello'))
		expect(readChatPrefs(KEY)).toEqual({})
	})

	it('returns {} when the stored payload is malformed JSON', () => {
		storage.setItem(STORAGE_PREFIX + KEY, '{not-json')
		expect(readChatPrefs(KEY)).toEqual({})
	})
})

describe('chatPrefs — safe degrade when localStorage is unavailable', () => {
	afterEach(uninstallLocalStorage)

	it('readChatPrefs returns {} when localStorage throws', () => {
		Object.defineProperty(window, 'localStorage', {
			value: {
				getItem: () => {
					throw new Error('SecurityError: localStorage disabled')
				}
			},
			configurable: true,
			writable: true
		})
		expect(readChatPrefs(KEY)).toEqual({})
	})

	it('writeChatPrefs swallows localStorage errors', () => {
		Object.defineProperty(window, 'localStorage', {
			value: {
				getItem: () => null,
				setItem: () => {
					throw new Error('QuotaExceededError')
				}
			},
			configurable: true,
			writable: true
		})
		expect(() => writeChatPrefs(KEY, { mode: 'plan_mode' })).not.toThrow()
	})
})
