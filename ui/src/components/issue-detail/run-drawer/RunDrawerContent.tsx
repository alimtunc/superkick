import { RunDrawerTabs } from '@/components/issue-detail/run-drawer/RunDrawerTabs'
import { RunChip } from '@/components/run-shared/RunChip'
import { RunMetaStrip } from '@/components/run-shared/RunMetaStrip'
import { RunSessionTabs } from '@/components/run-tabs/RunSessionTabs'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { useRunSession } from '@/hooks/useRunSession'
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
	const detail = useRunSession(runId)
	// Follow the live feed to the newest event (per active tab) unless the
	// reader has scrolled up to read history.
	const body = useStickToBottom<HTMLDivElement>(`${tab}:${detail.events.length}`)

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
				<RunSessionTabs
					tab={tab}
					onSelectTab={setTab}
					runId={run.id}
					run={run}
					pr={pr}
					sessions={sessions}
					attentionRequests={attentionRequests}
					events={detail.events}
					isTerminal={isTerminal}
				/>
			</div>
		</div>
	)
}
