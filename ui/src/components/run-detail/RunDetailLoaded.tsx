import { useMemo } from 'react'

import { ExecutionModeBadge } from '@/components/ExecutionModeBadge'
import { PrStateBadge } from '@/components/PrStateBadge'
import { pinClass, pinTitle } from '@/components/run-detail/pinHelpers'
import { RunConversation } from '@/components/run-detail/RunConversation'
import { RunStatusBanner } from '@/components/run-detail/RunStatusBanner'
import { RunWorkspace } from '@/components/run-detail/RunWorkspace'
import { RunStateBadge } from '@/components/RunStateBadge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Pill } from '@/components/ui/pill'
import { ChatDrawer } from '@/components/workspace/ChatDrawer'
import { ChatToggleButton } from '@/components/workspace/ChatToggleButton'
import type { useEventStream } from '@/hooks/useEventStream'
import type { useRunDetail } from '@/hooks/useRunDetail'
import { fmtElapsed } from '@/lib/domain'
import { TopbarBackButton } from '@/shell/TopbarBackButton'
import { usePageActions } from '@/shell/usePageActions'
import { useWatchedSessionsStore } from '@/stores/watchedSessions'
import type { Run } from '@/types'
import { ExternalLink, Pin, RefreshCw, Square } from 'lucide-react'

export type LoadedRunDetail = Omit<ReturnType<typeof useRunDetail>, 'run' | 'loading' | 'error'> & {
	run: Run
}

interface RunDetailLoadedProps {
	detail: LoadedRunDetail
	events: ReturnType<typeof useEventStream>['events']
	refTime: number
}

export function RunDetailLoaded({ detail, events, refTime }: RunDetailLoadedProps) {
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
				<ChatToggleButton />
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
		back: <TopbarBackButton />
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
			<div className="flex min-h-0 flex-1">
				<RunConversation
					events={events}
					attentionRequests={attentionRequests}
					disabled={isTerminal}
				/>
				<RunWorkspace
					run={run}
					pr={pr}
					steps={steps}
					sessions={sessions}
					events={events}
					attentionRequests={attentionRequests}
					isTerminal={isTerminal}
					refTime={refTime}
				/>
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
			<ChatDrawer subject={{ kind: 'run', run_id: run.id }} />
		</div>
	)
}
