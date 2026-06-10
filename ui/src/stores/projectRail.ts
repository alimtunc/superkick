import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ProjectRailState {
	compact: boolean
	toggleCompact: () => void
}

export const useProjectRailStore = create<ProjectRailState>()(
	persist(
		(set) => ({
			compact: false,
			toggleCompact: () => set((s) => ({ compact: !s.compact }))
		}),
		{ name: 'superkick:project-rail' }
	)
)
