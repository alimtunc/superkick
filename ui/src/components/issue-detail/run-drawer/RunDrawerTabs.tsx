import { TabBar, type TabBarItem } from '@/components/ui/tab-bar'
import { useRunDrawerStore, type RunDrawerTab } from '@/stores/runDrawer'
import { Activity, FileDiff, ScrollText, Terminal, Wrench } from 'lucide-react'

const TABS: readonly TabBarItem<RunDrawerTab>[] = [
	{ id: 'activity', label: 'Activity', icon: Activity },
	{ id: 'tools', label: 'Tools', icon: Wrench },
	{ id: 'files', label: 'Files', icon: FileDiff },
	{ id: 'logs', label: 'Logs', icon: ScrollText },
	{ id: 'terminal', label: 'Terminal', icon: Terminal }
]

export function RunDrawerTabs() {
	const tab = useRunDrawerStore((s) => s.tab)
	const setTab = useRunDrawerStore((s) => s.setTab)

	return (
		<TabBar
			tabs={TABS}
			activeId={tab}
			onChange={setTab}
			ariaLabel="Run drawer"
			className="border-edge bg-carbon"
		/>
	)
}
