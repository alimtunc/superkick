import { create } from 'zustand'

interface WorkspaceContextRailState {
	open: boolean
}

interface WorkspaceContextRailActions {
	toggleRail: () => void
}

export const useWorkspaceContextRailStore = create<WorkspaceContextRailState & WorkspaceContextRailActions>(
	(set) => ({
		open: false,
		toggleRail: () => set((s) => ({ open: !s.open }))
	})
)
