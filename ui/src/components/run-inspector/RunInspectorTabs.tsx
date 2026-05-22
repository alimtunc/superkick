import { ChangesTab } from '@/components/run-detail/RunWorkspaceTabs/ChangesTab'
import { ToolsTab } from '@/components/run-detail/RunWorkspaceTabs/ToolsTab'
import { ActivityTab } from '@/components/run-tabs/ActivityTab'
import { LogsTab } from '@/components/run-tabs/LogsTab'
import { TabBar, type TabBarItem } from '@/components/ui/tab-bar'
import type { AgentSession, AttentionRequest, PullRequest, Run, RunEvent } from '@/types'
import { Activity, FileDiff, ScrollText, Wrench } from 'lucide-react'

export type RunInspectorTabId = 'activity' | 'tools' | 'files' | 'logs'

interface RunInspectorTabsProps {
	tab: RunInspectorTabId
	onChangeTab: (tab: RunInspectorTabId) => void
	run: Run
	pr: PullRequest | null
	events: RunEvent[]
	sessions: AgentSession[]
	attentionRequests: AttentionRequest[]
}

const TABS: readonly TabBarItem<RunInspectorTabId>[] = [
	{ id: 'activity', label: 'Activity', icon: Activity },
	{ id: 'tools', label: 'Tools', icon: Wrench },
	{ id: 'files', label: 'Files', icon: FileDiff },
	{ id: 'logs', label: 'Logs', icon: ScrollText }
]

export function RunInspectorTabs({
	tab,
	onChangeTab,
	run,
	pr,
	events,
	sessions,
	attentionRequests
}: RunInspectorTabsProps) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<TabBar
				tabs={TABS}
				activeId={tab}
				onChange={onChangeTab}
				ariaLabel="Run inspector"
				className="border-edge bg-surface"
			/>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{tab === 'activity' ? (
					<ActivityTab events={events} sessions={sessions} attentionRequests={attentionRequests} />
				) : null}
				{tab === 'tools' ? (
					<ToolsTab events={events} sessions={sessions} attentionRequests={attentionRequests} />
				) : null}
				{tab === 'files' ? <ChangesTab pr={pr} run={run} /> : null}
				{tab === 'logs' ? <LogsTab events={events} /> : null}
			</div>
		</div>
	)
}
