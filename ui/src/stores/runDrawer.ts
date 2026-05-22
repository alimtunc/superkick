import { create } from 'zustand'

export type RunDrawerTab = 'activity' | 'tools' | 'files' | 'logs' | 'terminal'

interface RunDrawerState {
	open: boolean
	runId: string | null
	tab: RunDrawerTab
}

interface RunDrawerActions {
	openDrawer: (runId: string, tab?: RunDrawerTab) => void
	closeDrawer: () => void
	setTab: (tab: RunDrawerTab) => void
}

export const useRunDrawerStore = create<RunDrawerState & RunDrawerActions>((set) => ({
	open: false,
	runId: null,
	tab: 'activity',
	openDrawer: (runId, tab = 'activity') => set({ open: true, runId, tab }),
	closeDrawer: () => set({ open: false }),
	setTab: (tab) => set({ tab })
}))
