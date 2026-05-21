import { useCallback, useMemo, useReducer } from 'react'

import { parseCommandPrefix } from '@/lib/commandPrefix'
import type { SearchScope } from '@/types'

export type CommandBarMode = 'empty' | 'typing' | 'scoped'

export interface CommandBarState {
	rawQuery: string
	scope: SearchScope
	scopePinned: boolean
	selectedIdx: number
}

type Action =
	| { type: 'setQuery'; value: string }
	| { type: 'setScope'; scope: SearchScope }
	| { type: 'cycleScope'; direction: 1 | -1 }
	| { type: 'setSelected'; idx: number }
	| { type: 'moveSelected'; delta: number; max: number }
	| { type: 'reset' }

const SCOPE_ORDER: SearchScope[] = ['all', 'issues', 'comments', 'files', 'runs', 'actions']

const INITIAL: CommandBarState = {
	rawQuery: '',
	scope: 'all',
	scopePinned: false,
	selectedIdx: 0
}

function reducer(state: CommandBarState, action: Action): CommandBarState {
	switch (action.type) {
		case 'setQuery': {
			const next: CommandBarState = { ...state, rawQuery: action.value, selectedIdx: 0 }
			if (!state.scopePinned) {
				const parsed = parseCommandPrefix(action.value)
				if (parsed.scope) {
					next.scope = parsed.scope
				} else if (action.value.length === 0) {
					next.scope = 'all'
				}
			}
			return next
		}
		case 'setScope':
			return {
				...state,
				scope: action.scope,
				scopePinned: action.scope !== 'all',
				selectedIdx: 0
			}
		case 'cycleScope': {
			const currentIdx = SCOPE_ORDER.indexOf(state.scope)
			const nextIdx = (currentIdx + action.direction + SCOPE_ORDER.length) % SCOPE_ORDER.length
			const nextScope = SCOPE_ORDER[nextIdx]
			return {
				...state,
				scope: nextScope,
				scopePinned: nextScope !== 'all',
				selectedIdx: 0
			}
		}
		case 'setSelected':
			return { ...state, selectedIdx: Math.max(0, action.idx) }
		case 'moveSelected': {
			if (action.max <= 0) return { ...state, selectedIdx: 0 }
			const next = (state.selectedIdx + action.delta + action.max) % action.max
			return { ...state, selectedIdx: next }
		}
		case 'reset':
			return INITIAL
	}
}

export function modeFor(state: CommandBarState): CommandBarMode {
	if (state.scope !== 'all') return 'scoped'
	if (effectiveQueryFor(state).length > 0) return 'typing'
	return 'empty'
}

export function effectiveQueryFor(state: CommandBarState): string {
	if (state.scopePinned) return state.rawQuery.trim()
	const parsed = parseCommandPrefix(state.rawQuery)
	return parsed.rest.trim()
}

export function useCommandBarReducer() {
	const [state, dispatch] = useReducer(reducer, INITIAL)

	const setQuery = useCallback((value: string) => dispatch({ type: 'setQuery', value }), [])
	const setScope = useCallback((scope: SearchScope) => dispatch({ type: 'setScope', scope }), [])
	const cycleScope = useCallback((direction: 1 | -1) => dispatch({ type: 'cycleScope', direction }), [])
	const setSelected = useCallback((idx: number) => dispatch({ type: 'setSelected', idx }), [])
	const moveSelected = useCallback(
		(delta: number, max: number) => dispatch({ type: 'moveSelected', delta, max }),
		[]
	)
	const reset = useCallback(() => dispatch({ type: 'reset' }), [])

	const mode = useMemo(() => modeFor(state), [state])
	const effectiveQuery = useMemo(() => effectiveQueryFor(state), [state])

	return {
		state,
		mode,
		effectiveQuery,
		setQuery,
		setScope,
		cycleScope,
		setSelected,
		moveSelected,
		reset
	}
}

export type UseCommandBarReducerReturn = ReturnType<typeof useCommandBarReducer>
