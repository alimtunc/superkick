import { create } from 'zustand'

interface ProjectSwitchState {
	message: string | null
	begin: (message: string) => void
	clear: () => void
}

export const useProjectSwitchStore = create<ProjectSwitchState>((set) => ({
	message: null,
	begin: (message) => set({ message }),
	clear: () => set({ message: null })
}))
