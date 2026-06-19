import { useEffect, useId } from 'react'
import type { ReactNode } from 'react'

import { create } from 'zustand'

interface PageActionsSlots {
	title: ReactNode | null
	crumbs: string[] | null
	sub: ReactNode | null
	right: ReactNode | null
	back: ReactNode | null
}

interface PageActionsState extends PageActionsSlots {
	owner: string | null
	setSlots: (owner: string, slots: PageActionsSlots) => void
	releaseSlots: (owner: string) => void
}

export const usePageActionsStore = create<PageActionsState>((set) => ({
	owner: null,
	title: null,
	crumbs: null,
	sub: null,
	right: null,
	back: null,
	setSlots: (owner, slots) => set({ owner, ...slots }),
	releaseSlots: (owner) =>
		set((state) =>
			state.owner === owner
				? { owner: null, title: null, crumbs: null, sub: null, right: null, back: null }
				: state
		)
}))

interface PageActionsHookArgs {
	title?: ReactNode | null
	crumbs?: string[] | null
	sub?: ReactNode | null
	right?: ReactNode | null
	back?: ReactNode | null
}

export function usePageActions({ title, crumbs, sub, right, back }: PageActionsHookArgs) {
	const owner = useId()
	const setSlots = usePageActionsStore((s) => s.setSlots)
	const releaseSlots = usePageActionsStore((s) => s.releaseSlots)
	useEffect(() => {
		setSlots(owner, {
			title: title ?? null,
			crumbs: crumbs ?? null,
			sub: sub ?? null,
			right: right ?? null,
			back: back ?? null
		})
		return () => releaseSlots(owner)
	}, [owner, title, crumbs, sub, right, back, setSlots, releaseSlots])
}
