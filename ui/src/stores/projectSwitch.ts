import { create } from 'zustand'

interface ProjectSwitchState {
	message: string | null
	targetProjectId: string | null
	begin: (message: string, targetProjectId?: string) => void
	clear: () => void
}

export const useProjectSwitchStore = create<ProjectSwitchState>((set) => ({
	message: null,
	targetProjectId: null,
	begin: (message, targetProjectId) => set({ message, targetProjectId: targetProjectId ?? null }),
	clear: () => set({ message: null, targetProjectId: null })
}))
