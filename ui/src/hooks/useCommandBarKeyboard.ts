import { useCallback } from 'react'

import type { UseCommandBarReducerReturn } from './useCommandBarReducer'

interface UseCommandBarKeyboardOptions {
	reducer: UseCommandBarReducerReturn
	itemCount: number
	onActivate: (idx: number, modifier: 'enter' | 'cmdEnter') => void
	onClose: () => void
}

export function useCommandBarKeyboard({
	reducer,
	itemCount,
	onActivate,
	onClose
}: UseCommandBarKeyboardOptions) {
	return useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault()
				onClose()
				return
			}
			if (e.key === 'Tab') {
				e.preventDefault()
				reducer.cycleScope(e.shiftKey ? -1 : 1)
				return
			}
			if (e.key === 'ArrowDown') {
				e.preventDefault()
				reducer.moveSelected(1, itemCount)
				return
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault()
				reducer.moveSelected(-1, itemCount)
				return
			}
			if (e.key === 'Enter') {
				e.preventDefault()
				if (itemCount === 0) return
				onActivate(reducer.state.selectedIdx, e.metaKey || e.ctrlKey ? 'cmdEnter' : 'enter')
			}
		},
		[reducer, itemCount, onActivate, onClose]
	)
}
