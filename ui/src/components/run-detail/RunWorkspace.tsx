import { useEffect, useState } from 'react'

import { ChangesTab } from '@/components/run-detail/RunWorkspaceTabs/ChangesTab'
import { ContextTab } from '@/components/run-detail/RunWorkspaceTabs/ContextTab'
import { ShellTab } from '@/components/run-detail/RunWorkspaceTabs/ShellTab'
import { ToolsTab } from '@/components/run-detail/RunWorkspaceTabs/ToolsTab'
import { TabBar, type TabBarItem } from '@/components/ui/tab-bar'
import type { AgentSession, AttentionRequest, PullRequest, Run, RunEvent, RunStep } from '@/types'
import { useLocation } from '@tanstack/react-router'
import { FileDiff, FolderOpen, Terminal, Wrench } from 'lucide-react'

type WorkspaceTabId = 'changes' | 'shell' | 'tools' | 'context'

function tabFromHash(hash: string): WorkspaceTabId | null {
	const stripped = hash.replace(/^#/, '')
	if (stripped === 'terminal' || stripped === 'shell') return 'shell'
	if (stripped === 'changes' || stripped === 'tools' || stripped === 'context') return stripped
	return null
}

interface RunWorkspaceProps {
	run: Run
	pr: PullRequest | null
	steps: RunStep[]
	sessions: AgentSession[]
	events: RunEvent[]
	attentionRequests: AttentionRequest[]
	isTerminal: boolean
	refTime: number
}

const TABS: readonly TabBarItem<WorkspaceTabId>[] = [
	{ id: 'changes', label: 'Changes', icon: FileDiff },
	{ id: 'shell', label: 'Shell', icon: Terminal },
	{ id: 'tools', label: 'Tools', icon: Wrench },
	{ id: 'context', label: 'Context', icon: FolderOpen }
]

export function RunWorkspace({
	run,
	pr,
	steps,
	sessions,
	events,
	attentionRequests,
	isTerminal,
	refTime
}: RunWorkspaceProps) {
	const { hash } = useLocation()
	const [tab, setTab] = useState<WorkspaceTabId>(() => tabFromHash(hash) ?? 'changes')

	useEffect(() => {
		const fromHash = tabFromHash(hash)
		if (fromHash) setTab(fromHash)
	}, [hash])

	return (
		<aside className="flex w-90 shrink-0 flex-col border-l border-border bg-surface">
			<TabBar
				tabs={TABS}
				activeId={tab}
				onChange={setTab}
				ariaLabel="Run workspace"
				className="border-border bg-surface"
			/>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{tab === 'changes' ? <ChangesTab pr={pr} run={run} /> : null}
				{tab === 'shell' ? <ShellTab runId={run.id} isTerminal={isTerminal} /> : null}
				{tab === 'tools' ? (
					<ToolsTab events={events} sessions={sessions} attentionRequests={attentionRequests} />
				) : null}
				{tab === 'context' ? (
					<ContextTab
						run={run}
						pr={pr}
						steps={steps}
						sessions={sessions}
						attentionRequests={attentionRequests}
						refTime={refTime}
					/>
				) : null}
			</div>
		</aside>
	)
}
