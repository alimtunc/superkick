import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { effectiveQueryFor, modeFor, useCommandBarReducer } from './useCommandBarReducer'

describe('useCommandBarReducer', () => {
	it('starts in empty mode with scope=all', () => {
		const { result } = renderHook(() => useCommandBarReducer())
		expect(result.current.mode).toBe('empty')
		expect(result.current.state.scope).toBe('all')
		expect(result.current.state.scopePinned).toBe(false)
	})

	it('transitions to typing when query has content and scope is all', () => {
		const { result } = renderHook(() => useCommandBarReducer())
		act(() => result.current.setQuery('webhook'))
		expect(result.current.mode).toBe('typing')
		expect(result.current.effectiveQuery).toBe('webhook')
	})

	it('detects i: prefix and switches to scoped (issues) without pinning', () => {
		const { result } = renderHook(() => useCommandBarReducer())
		act(() => result.current.setQuery('i:bug'))
		expect(result.current.state.scope).toBe('issues')
		expect(result.current.state.scopePinned).toBe(false)
		expect(result.current.effectiveQuery).toBe('bug')
		expect(result.current.mode).toBe('scoped')
	})

	it('pins scope when explicitly set via setScope', () => {
		const { result } = renderHook(() => useCommandBarReducer())
		act(() => result.current.setScope('files'))
		expect(result.current.state.scope).toBe('files')
		expect(result.current.state.scopePinned).toBe(true)
		expect(result.current.mode).toBe('scoped')
	})

	it('setScope(all) clears pinning and returns to empty when query is empty', () => {
		const { result } = renderHook(() => useCommandBarReducer())
		act(() => result.current.setScope('issues'))
		act(() => result.current.setScope('all'))
		expect(result.current.state.scopePinned).toBe(false)
		expect(result.current.mode).toBe('empty')
	})

	it('cycleScope rotates through scopes in order', () => {
		const { result } = renderHook(() => useCommandBarReducer())
		act(() => result.current.cycleScope(1))
		expect(result.current.state.scope).toBe('issues')
		act(() => result.current.cycleScope(1))
		expect(result.current.state.scope).toBe('comments')
		act(() => result.current.cycleScope(-1))
		expect(result.current.state.scope).toBe('issues')
	})

	it('moveSelected wraps within bounds', () => {
		const { result } = renderHook(() => useCommandBarReducer())
		act(() => result.current.moveSelected(1, 3))
		expect(result.current.state.selectedIdx).toBe(1)
		act(() => result.current.moveSelected(1, 3))
		act(() => result.current.moveSelected(1, 3))
		expect(result.current.state.selectedIdx).toBe(0)
		act(() => result.current.moveSelected(-1, 3))
		expect(result.current.state.selectedIdx).toBe(2)
	})

	it('reset returns to initial state', () => {
		const { result } = renderHook(() => useCommandBarReducer())
		act(() => result.current.setQuery('hello'))
		act(() => result.current.setScope('issues'))
		act(() => result.current.reset())
		expect(result.current.state).toEqual({
			rawQuery: '',
			scope: 'all',
			scopePinned: false,
			selectedIdx: 0
		})
	})

	it('typing empty after a prefix-derived scope resets to all', () => {
		const { result } = renderHook(() => useCommandBarReducer())
		act(() => result.current.setQuery('i:'))
		expect(result.current.state.scope).toBe('issues')
		act(() => result.current.setQuery(''))
		expect(result.current.state.scope).toBe('all')
	})

	it('typing empty while scope is pinned keeps the pinned scope', () => {
		const { result } = renderHook(() => useCommandBarReducer())
		act(() => result.current.setScope('files'))
		act(() => result.current.setQuery(''))
		expect(result.current.state.scope).toBe('files')
	})

	it('modeFor and effectiveQueryFor mirror hook outputs', () => {
		const state = {
			rawQuery: 'c:bug',
			scope: 'comments' as const,
			scopePinned: false,
			selectedIdx: 0
		}
		expect(modeFor(state)).toBe('scoped')
		expect(effectiveQueryFor(state)).toBe('bug')
	})
})
