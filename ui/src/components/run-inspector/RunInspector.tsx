import { useEffect, useMemo, useState } from 'react'

import { ExecutionModeBadge } from '@/components/ExecutionModeBadge'
import { PrStateBadge } from '@/components/PrStateBadge'
import { pinClass, pinTitle } from '@/components/run-detail/pinHelpers'
import { RunStatusBanner } from '@/components/run-detail/RunStatusBanner'
import { RunInspectorFacts } from '@/components/run-inspector/RunInspectorFacts'
import { RunInspectorMetaStrip } from '@/components/run-inspector/RunInspectorMetaStrip'
import { RunInspectorParentBanner } from '@/components/run-inspector/RunInspectorParentBanner'
import {
	RunInspectorTabs,
	tabFromHash,
	type RunInspectorTabId
} from '@/components/run-inspector/RunInspectorTabs'
import { RunStateBadge } from '@/components/RunStateBadge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Pill } from '@/components/ui/pill'
import type { useEventStream } from '@/hooks/useEventStream'
import type { LoadedRunDetail } from '@/hooks/useRunDetail'
import { fmtElapsed } from '@/lib/domain'
import { TopbarBackButton } from '@/shell/TopbarBackButton'
import { usePageActions } from '@/shell/usePageActions'
import { useWatchedSessionsStore } from '@/stores/watchedSessions'
import { useLocation } from '@tanstack/react-router'
import { ExternalLink, Pin, RefreshCw, Square } from 'lucide-react'

interface RunInspectorProps {
	detail: LoadedRunDetail
	events: ReturnType<typeof useEventStream>['events']
	refTime: number
}

export function RunInspector({ detail, events, refTime }: RunInspectorProps) {
	const {
		run,
		pr,
		steps,
		sessions,
		attentionRequests,
		interrupts,
		isTerminal,
		showInterrupts,
		refresh,
		syncRun,
		cancelConfirm,
		setCancelConfirm,
		handleCancel,
		cancelling
	} = detail

	const { hash } = useLocation()
	const [tab, setTab] = useState<RunInspectorTabId>(() => tabFromHash(hash) ?? 'activity')

	useEffect(() => {
		const fromHash = tabFromHash(hash)
		if (fromHash) setTab(fromHash)
	}, [hash])

	const { isWatched, toggleWatch, maxReached } = useWatchedSessionsStore()
	const watched = isWatched(run.id)
	const elapsed = fmtElapsed(run.started_at, refTime)

	const sub = useMemo(
		() => (
			<>
				<Pill mono size="xs">
					{run.issue_identifier}
				</Pill>
				<RunStateBadge state={run.state} />
				{run.execution_mode ? <ExecutionModeBadge mode={run.execution_mode} /> : null}
				<span className="font-data text-[11px] text-fg-dim">· {elapsed}</span>
			</>
		),
		[run.issue_identifier, run.state, run.execution_mode, elapsed]
	)

	const right = useMemo(
		() => (
			<>
				<button
					type="button"
					onClick={() => toggleWatch(run.id)}
					disabled={!watched && maxReached}
					aria-label={pinTitle(watched, maxReached)}
					aria-pressed={watched}
					title={pinTitle(watched, maxReached)}
					className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none ${pinClass(watched, maxReached)}`}
				>
					<Pin
						size={14}
						strokeWidth={1.75}
						aria-hidden="true"
						className={watched ? 'fill-current' : undefined}
					/>
				</button>
				<button
					type="button"
					onClick={() => refresh()}
					aria-label="Refresh run data"
					title="Refresh run data"
					className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				>
					<RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
				</button>
				{pr ? (
					<a
						href={pr.url}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 rounded-md border border-success/40 px-2 py-1 text-[12px] text-success hover:bg-success/10 focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none"
						aria-label={`Open PR #${pr.number}`}
					>
						<ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />#{pr.number}
						<PrStateBadge state={pr.state} />
					</a>
				) : null}
				{!isTerminal ? (
					<button
						type="button"
						onClick={() => setCancelConfirm(true)}
						aria-label="Cancel run"
						title="Cancel run"
						className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-danger/40 focus-visible:outline-none"
					>
						<Square size={12} strokeWidth={1.75} aria-hidden="true" className="fill-current" />
					</button>
				) : null}
			</>
		),
		[pr, isTerminal, watched, maxReached, run.id, toggleWatch, refresh, setCancelConfirm]
	)

	usePageActions({
		title: run.id.slice(0, 8),
		sub,
		right,
		back: <TopbarBackButton fallbackTo={run.issue_identifier ? `/issues/${run.issue_identifier}` : '/'} />
	})

	return (
		<div className="flex h-full min-h-0 flex-col">
			<RunStatusBanner
				run={run}
				pr={pr}
				isTerminal={isTerminal}
				attentionRequests={attentionRequests}
				interrupts={interrupts}
				showInterrupts={showInterrupts}
				onSync={syncRun}
			/>
			<RunInspectorParentBanner run={run} />
			<RunInspectorMetaStrip run={run} sessions={sessions} />
			<div className="flex min-h-0 flex-1">
				<RunInspectorTabs
					tab={tab}
					onChangeTab={setTab}
					run={run}
					pr={pr}
					events={events}
					sessions={sessions}
					attentionRequests={attentionRequests}
					isTerminal={isTerminal}
				/>
				<RunInspectorFacts run={run} pr={pr} steps={steps} sessions={sessions} refTime={refTime} />
			</div>
			<ConfirmDialog
				open={cancelConfirm}
				onOpenChange={(open) => {
					if (!open) setCancelConfirm(false)
				}}
				title="Cancel this run?"
				description={
					<>
						<span className="font-data text-fg">{run.issue_identifier}</span> will be stopped.
						In-flight agent work is discarded, but the worktree and any committed changes are
						preserved.
					</>
				}
				confirmLabel="Cancel run"
				cancelLabel="Keep running"
				destructive
				busy={cancelling}
				onConfirm={handleCancel}
			/>
		</div>
	)
}
