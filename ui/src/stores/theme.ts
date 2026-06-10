import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
	mode: ThemeMode
	setMode: (mode: ThemeMode) => void
}

// jsdom has no matchMedia; the guard keeps any test importing this store from crashing at import time.
const darkQuery =
	typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
	if (mode === 'system') return darkQuery?.matches ? 'dark' : 'light'
	return mode
}

function isThemeMode(value: unknown): value is ThemeMode {
	return value === 'light' || value === 'dark' || value === 'system'
}

function migrateMode(persisted: unknown): ThemeMode {
	if (typeof persisted !== 'object' || persisted === null) return 'system'
	const record = persisted as Record<string, unknown>
	if (isThemeMode(record.mode)) return record.mode
	if (record.theme === 'light' || record.theme === 'dark') return record.theme
	return 'system'
}

export const useThemeStore = create<ThemeState>()(
	persist(
		(set) => ({
			mode: 'system',
			setMode: (mode: ThemeMode) => set({ mode })
		}),
		{
			name: 'superkick:theme',
			version: 1,
			partialize: (s) => ({ mode: s.mode }),
			migrate: (persisted) => ({ mode: migrateMode(persisted) })
		}
	)
)

function applyTheme() {
	document.documentElement.setAttribute('data-theme', resolveTheme(useThemeStore.getState().mode))
}

applyTheme()
useThemeStore.subscribe(applyTheme)
darkQuery?.addEventListener('change', () => {
	if (useThemeStore.getState().mode === 'system') applyTheme()
})
