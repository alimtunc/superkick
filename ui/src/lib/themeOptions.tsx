import type { ThemeMode } from '@/stores/theme'
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'

export const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: LucideIcon }[] = [
	{ mode: 'light', label: 'Light', icon: Sun },
	{ mode: 'dark', label: 'Dark', icon: Moon },
	{ mode: 'system', label: 'System', icon: Monitor }
]

export function themeButtonClass(active: boolean): string {
	const base = 'flex cursor-pointer items-center justify-center rounded-md p-1.5'
	if (active) return `${base} bg-raised text-fg`
	return `${base} text-fg-dim hover:text-fg`
}
