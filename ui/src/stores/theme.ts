import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'dark' | 'light'

interface ThemeState {
	theme: Theme
	setTheme: (theme: Theme) => void
	toggleTheme: () => void
}

export const useThemeStore = create<ThemeState>()(
	persist(
		(set) => ({
			theme: 'dark',
			setTheme: (theme: Theme) => set({ theme }),
			toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' }))
		}),
		{ name: 'superkick:theme' }
	)
)

function applyTheme(theme: Theme) {
	document.documentElement.setAttribute('data-theme', theme)
}

applyTheme(useThemeStore.getState().theme)
useThemeStore.subscribe((s) => applyTheme(s.theme))
