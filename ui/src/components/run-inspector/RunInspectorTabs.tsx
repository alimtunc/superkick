import { ChangesTab } from '@/components/run-detail/RunWorkspaceTabs/ChangesTab'
import { ShellTab } from '@/components/run-detail/RunWorkspaceTabs/ShellTab'
import { ToolsTab } from '@/components/run-detail/RunWorkspaceTabs/ToolsTab'
import { ActivityTab } from '@/components/run-tabs/ActivityTab'
import { LogsTab } from '@/components/run-tabs/LogsTab'
import { TabBar, type TabBarItem } from '@/components/ui/tab-bar'
import type { AgentSession, AttentionRequest, PullRequest, Run, RunEvent } from '@/types'
import { Activity, FileDiff, ScrollText, Terminal, Wrench } from 'lucide-react'

const TABS = [
	{ id: 'activity', label: 'Activity', icon: Activity },
	{ id: 'tools', label: 'Tools', icon: Wrench },
	{ id: 'files', label: 'Files', icon: FileDiff },
	{ id: 'logs', label: 'Logs', icon: ScrollText },
	{ id: 'terminal', label: 'Terminal', icon: Terminal }
] as const satisfies readonly TabBarItem<string>[]

export type RunInspectorTabId = (typeof TABS)[number]['id']

export function tabFromHash(hash: string): RunInspectorTabId | null {
	const stripped = hash.replace(/^#/, '')
	const match = TABS.find((tab) => tab.id === stripped)
	return match ? match.id : null
}

interface RunInspectorTabsProps {
	tab: RunInspectorTabId
	onChangeTab: (tab: RunInspectorTabId) => void
	run: Run
	pr: PullRequest | null
	events: RunEvent[]
	sessions: AgentSession[]
	attentionRequests: AttentionRequest[]
	isTerminal: boolean
}

export function RunInspectorTabs({
	tab,
	onChangeTab,
	run,
	pr,
	events,
	sessions,
	attentionRequests,
	isTerminal
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
				{tab === 'tools' ? <ToolsTab runId={run.id} /> : null}
				{tab === 'files' ? <ChangesTab pr={pr} run={run} /> : null}
				{tab === 'logs' ? (
					<LogsTab events={events} onOpenTerminal={() => onChangeTab('terminal')} />
				) : null}
				{tab === 'terminal' ? <ShellTab runId={run.id} isTerminal={isTerminal} /> : null}
			</div>
		</div>
	)
}
