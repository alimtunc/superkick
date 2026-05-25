import { RunDrawerTabs } from '@/components/issue-detail/run-drawer/RunDrawerTabs'
import { ChangesTab } from '@/components/run-detail/RunWorkspaceTabs/ChangesTab'
import { ShellTab } from '@/components/run-detail/RunWorkspaceTabs/ShellTab'
import { ToolsTab } from '@/components/run-detail/RunWorkspaceTabs/ToolsTab'
import { RunMetaStrip } from '@/components/run-shared/RunMetaStrip'
import { ActivityTab } from '@/components/run-tabs/ActivityTab'
import { LogsTab } from '@/components/run-tabs/LogsTab'
import { RunStateBadge } from '@/components/RunStateBadge'
import { Pill } from '@/components/ui/pill'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { useEventStream } from '@/hooks/useEventStream'
import { useRunDetail } from '@/hooks/useRunDetail'
import { useRunDrawerStore } from '@/stores/runDrawer'
import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'

interface RunDrawerContentProps {
	runId: string
}

export function RunDrawerContent({ runId }: RunDrawerContentProps) {
	const tab = useRunDrawerStore((s) => s.tab)
	const setTab = useRunDrawerStore((s) => s.setTab)
	const detail = useRunDetail(runId)
	const stream = useEventStream(runId, detail.syncRun)

	if (detail.loading) {
		return (
			<div className="px-4 py-6">
				<LoadingState rows={4} />
			</div>
		)
	}

	if (detail.error) {
		return (
			<div className="px-4 py-6">
				<ErrorState title="Run load failed" message={detail.error} onRetry={() => detail.refresh()} />
			</div>
		)
	}

	if (!detail.run) {
		return (
			<div className="px-4 py-6">
				<ErrorState
					title="Run not found"
					message="It may have been deleted or the identifier is wrong."
				/>
			</div>
		)
	}

	const { run, pr, sessions, attentionRequests, isTerminal } = detail

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex shrink-0 items-center gap-2 border-b border-edge px-4 py-2">
				<Link
					to="/issues/$issueId"
					params={{ issueId: run.issue_identifier }}
					aria-label={`Open issue ${run.issue_identifier}`}
					title={`Open issue ${run.issue_identifier}`}
					className="rounded-md focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				>
					<Pill mono size="xs" interactive>
						{run.issue_identifier}
					</Pill>
				</Link>
				<RunStateBadge state={run.state} />
				<span className="font-data ml-auto text-[11px] text-fg-dim">{run.id.slice(0, 8)}</span>
				<Link
					to="/runs/$runId"
					params={{ runId: run.id }}
					className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] text-fg-muted hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
					aria-label="Open run detail"
					title="Open run detail"
				>
					<ExternalLink size={11} strokeWidth={1.85} aria-hidden="true" />
					Detail
				</Link>
			</div>
			<RunMetaStrip run={run} sessions={sessions} density="compact" />
			<RunDrawerTabs />
			<div className="min-h-0 flex-1 overflow-y-auto">
				{tab === 'activity' ? (
					<ActivityTab
						events={stream.events}
						sessions={sessions}
						attentionRequests={attentionRequests}
					/>
				) : null}
				{tab === 'tools' ? <ToolsTab runId={run.id} /> : null}
				{tab === 'files' ? <ChangesTab pr={pr} run={run} /> : null}
				{tab === 'logs' ? (
					<LogsTab events={stream.events} onOpenTerminal={() => setTab('terminal')} />
				) : null}
				{tab === 'terminal' ? <ShellTab runId={run.id} isTerminal={isTerminal} /> : null}
			</div>
		</div>
	)
}
