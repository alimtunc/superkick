import { create } from 'zustand'

interface CommandBarVisibilityState {
	open: boolean
	openBar: () => void
	closeBar: () => void
	toggle: () => void
}

export const useCommandBarStore = create<CommandBarVisibilityState>((set) => ({
	open: false,
	openBar: () => set({ open: true }),
	closeBar: () => set({ open: false }),
	toggle: () => set((s) => ({ open: !s.open }))
}))
