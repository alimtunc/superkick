import { ChangesTab } from '@/domains/runs/components/run-detail/RunWorkspaceTabs/ChangesTab'
import { ShellTab } from '@/domains/runs/components/run-detail/RunWorkspaceTabs/ShellTab'
import { ToolsTab } from '@/domains/runs/components/run-detail/RunWorkspaceTabs/ToolsTab'
import { ActivityTab } from '@/domains/runs/components/run-tabs/ActivityTab'
import { LogsTab } from '@/domains/runs/components/run-tabs/LogsTab'
import type { RunSessionTab } from '@/domains/runs/components/run-tabs/runSessionTabItems'
import type { AgentSession, AttentionRequest, PullRequest, Run, RunEvent } from '@/types'

interface RunSessionTabsProps {
	tab: RunSessionTab
	onSelectTab: (tab: RunSessionTab) => void
	runId: string
	run: Run
	pr: PullRequest | null
	sessions: AgentSession[]
	attentionRequests: AttentionRequest[]
	events: RunEvent[]
	isTerminal: boolean
}

// `events` may be caller-scoped (e.g. to one launch step): Activity/Tools/Logs
// follow it; Files and Terminal stay run-wide.
export function RunSessionTabs({
	tab,
	onSelectTab,
	runId,
	run,
	pr,
	sessions,
	attentionRequests,
	events,
	isTerminal
}: RunSessionTabsProps) {
	return (
		<>
			{tab === 'activity' ? (
				<ActivityTab events={events} sessions={sessions} attentionRequests={attentionRequests} />
			) : null}
			{tab === 'tools' ? <ToolsTab runId={runId} events={events} /> : null}
			{tab === 'files' ? <ChangesTab pr={pr} run={run} /> : null}
			{tab === 'logs' ? (
				<LogsTab events={events} onOpenTerminal={() => onSelectTab('terminal')} />
			) : null}
			{tab === 'terminal' ? <ShellTab runId={runId} isTerminal={isTerminal} /> : null}
		</>
	)
}
