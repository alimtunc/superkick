import type { TabBarItem } from '@/components/ui/tab-bar'
import { Activity, FileDiff, ScrollText, Terminal, Wrench } from 'lucide-react'

export type RunSessionTab = 'activity' | 'tools' | 'files' | 'logs' | 'terminal'

export const RUN_SESSION_TAB_ITEMS = [
	{ id: 'activity', label: 'Activity', icon: Activity },
	{ id: 'tools', label: 'Tool calls', icon: Wrench },
	{ id: 'files', label: 'Files', icon: FileDiff },
	{ id: 'logs', label: 'Logs', icon: ScrollText },
	{ id: 'terminal', label: 'Terminal', icon: Terminal }
] as const satisfies readonly TabBarItem<RunSessionTab>[]
