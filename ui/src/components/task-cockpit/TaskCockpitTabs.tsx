import { TabBar, type TabBarItem } from '@/components/ui/tab-bar'
import type { LaunchTaskStep } from '@/types'
import { Activity, FileDiff, ScrollText, Terminal } from 'lucide-react'

import { uniqueChangedFiles } from './changedFiles'

export type TaskCockpitTabId = 'activity' | 'files' | 'logs' | 'terminal'

const TABS = [
	{ id: 'activity', label: 'Activity', icon: Activity },
	{ id: 'files', label: 'Files changed', icon: FileDiff },
	{ id: 'logs', label: 'Step summaries', icon: ScrollText },
	{ id: 'terminal', label: 'Terminal', icon: Terminal }
] as const satisfies readonly TabBarItem<TaskCockpitTabId>[]

interface TaskCockpitTabsProps {
	steps: readonly LaunchTaskStep[]
	activeTab: TaskCockpitTabId
	onChangeTab: (tab: TaskCockpitTabId) => void
}

export function TaskCockpitTabs({ steps, activeTab, onChangeTab }: TaskCockpitTabsProps) {
	const changedFiles = uniqueChangedFiles(steps).length

	return (
		<div className="flex shrink-0 items-center border-b border-border bg-surface">
			<TabBar
				tabs={TABS}
				activeId={activeTab}
				onChange={onChangeTab}
				ariaLabel="Task cockpit"
				className="min-w-0 flex-1 border-0 bg-surface"
			/>
			<div className="font-data hidden shrink-0 items-center gap-3 px-4 text-[11px] text-fg-dim md:flex">
				<span>{steps.length} steps</span>
				<span>{changedFiles} files</span>
			</div>
		</div>
	)
}
