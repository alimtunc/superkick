import { useEffect } from 'react'
import type { ReactNode } from 'react'

import { create } from 'zustand'

interface PageActionsState {
	title: ReactNode | null
	sub: ReactNode | null
	right: ReactNode | null
	setSlots: (
		slots: Partial<{ title: ReactNode | null; sub: ReactNode | null; right: ReactNode | null }>
	) => void
	clearSlots: () => void
}

export const usePageActionsStore = create<PageActionsState>((set) => ({
	title: null,
	sub: null,
	right: null,
	setSlots: (slots) => set(slots),
	clearSlots: () => set({ title: null, sub: null, right: null })
}))

interface PageActionsHookArgs {
	title?: ReactNode | null
	sub?: ReactNode | null
	right?: ReactNode | null
}

export function usePageActions({ title, sub, right }: PageActionsHookArgs) {
	const setSlots = usePageActionsStore((s) => s.setSlots)
	const clearSlots = usePageActionsStore((s) => s.clearSlots)
	useEffect(() => {
		setSlots({ title: title ?? null, sub: sub ?? null, right: right ?? null })
		return () => clearSlots()
	}, [title, sub, right, setSlots, clearSlots])
}
