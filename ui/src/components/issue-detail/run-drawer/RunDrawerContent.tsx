import { RunDrawerTabs } from '@/components/issue-detail/run-drawer/RunDrawerTabs'
import { ChangesTab } from '@/components/run-detail/RunWorkspaceTabs/ChangesTab'
import { ShellTab } from '@/components/run-detail/RunWorkspaceTabs/ShellTab'
import { ToolsTab } from '@/components/run-detail/RunWorkspaceTabs/ToolsTab'
import { RunChip } from '@/components/run-shared/RunChip'
import { RunMetaStrip } from '@/components/run-shared/RunMetaStrip'
import { ActivityTab } from '@/components/run-tabs/ActivityTab'
import { LogsTab } from '@/components/run-tabs/LogsTab'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { useEventStream } from '@/hooks/useEventStream'
import { useRunDetail } from '@/hooks/useRunDetail'
import { useStickToBottom } from '@/hooks/useStickToBottom'
import { useRunDrawerStore } from '@/stores/runDrawer'
import { Icon } from '@/ui/Icon'
import { Link } from '@tanstack/react-router'

interface RunDrawerContentProps {
	runId: string
}

export function RunDrawerContent({ runId }: RunDrawerContentProps) {
	const tab = useRunDrawerStore((s) => s.tab)
	const setTab = useRunDrawerStore((s) => s.setTab)
	const closeDrawer = useRunDrawerStore((s) => s.closeDrawer)
	const detail = useRunDetail(runId)
	const stream = useEventStream(runId, detail.syncRun)
	// Follow the live feed to the newest event (per active tab) unless the
	// reader has scrolled up to read history.
	const body = useStickToBottom<HTMLDivElement>(`${tab}:${stream.events.length}`)

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
			<div className="drawer__head">
				<Icon name="terminal" size={16} className="ic text-fg-muted" />
				<span className="drawer__id mono">{run.id.slice(0, 8)}</span>
				<RunChip state={run.state} />
				<span className="spacer" />
				<Link
					to="/issues/$issueId"
					params={{ issueId: run.issue_identifier }}
					aria-label={`Open issue ${run.issue_identifier}`}
					title={`Open issue ${run.issue_identifier}`}
					className="iconbtn"
				>
					<Icon name="issue" size={16} className="ic" />
				</Link>
				<Link
					to="/runs/$runId"
					params={{ runId: run.id }}
					className="iconbtn"
					aria-label="Open run detail"
					title="Open run detail"
				>
					<Icon name="external" size={16} className="ic" />
				</Link>
				<button
					type="button"
					className="iconbtn"
					onClick={closeDrawer}
					aria-label="Close run drawer"
					title="Close run drawer"
				>
					<Icon name="x" size={16} className="ic" />
				</button>
			</div>
			<RunMetaStrip run={run} sessions={sessions} density="compact" />
			<RunDrawerTabs />
			<div className="drawer__body" ref={body.ref} onScroll={body.onScroll}>
				{tab === 'activity' ? (
					<ActivityTab
						events={stream.events}
						sessions={sessions}
						attentionRequests={attentionRequests}
					/>
				) : null}
				{tab === 'tools' ? <ToolsTab runId={run.id} events={stream.events} /> : null}
				{tab === 'files' ? <ChangesTab pr={pr} run={run} /> : null}
				{tab === 'logs' ? (
					<LogsTab events={stream.events} onOpenTerminal={() => setTab('terminal')} />
				) : null}
				{tab === 'terminal' ? <ShellTab runId={run.id} isTerminal={isTerminal} /> : null}
			</div>
		</div>
	)
}
