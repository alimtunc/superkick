import { useMemo } from 'react'

import { ExecutionModeBadge } from '@/components/ExecutionModeBadge'
import { PrStateBadge } from '@/components/PrStateBadge'
import { RunConversation } from '@/components/run-detail/RunConversation'
import { RunStatusBanner } from '@/components/run-detail/RunStatusBanner'
import { RunWorkspace } from '@/components/run-detail/RunWorkspace'
import { RunStateBadge } from '@/components/RunStateBadge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Pill } from '@/components/ui/pill'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { ChatDrawer } from '@/components/workspace/ChatDrawer'
import { ChatToggleButton } from '@/components/workspace/ChatToggleButton'
import { useEventStream } from '@/hooks/useEventStream'
import { useRunDetail } from '@/hooks/useRunDetail'
import { fmtElapsed } from '@/lib/domain'
import { TopbarBackButton } from '@/shell/TopbarBackButton'
import { usePageActions } from '@/shell/usePageActions'
import { useWatchedSessionsStore } from '@/stores/watchedSessions'
import type { PullRequest, Run } from '@/types'
import { ExternalLink, FileSearch, Pin, RefreshCw, Square } from 'lucide-react'

export function RunDetailView({ runId, refTime = Date.now() }: { runId: string; refTime?: number }) {
	const detail = useRunDetail(runId)
	const stream = useEventStream(runId, detail.syncRun)
	const { isWatched, toggleWatch, maxReached } = useWatchedSessionsStore()
	const watched = isWatched(runId)

	if (detail.loading)
		return (
			<div className="px-6 py-6">
				<LoadingState rows={5} />
			</div>
		)
	if (detail.error)
		return (
			<div className="px-6 py-6">
				<ErrorState title="Run load failed" message={detail.error} onRetry={detail.refresh} />
			</div>
		)
	if (!detail.run)
		return (
			<div className="px-6 py-6">
				<EmptyState
					icon={FileSearch}
					title="Run not found"
					description="It may have been deleted or the identifier is wrong."
				/>
			</div>
		)

	return (
		<RunDetailLoaded
			run={detail.run}
			pr={detail.pr}
			steps={detail.steps}
			sessions={detail.sessions}
			events={stream.events}
			attentionRequests={detail.attentionRequests}
			interrupts={detail.interrupts}
			isTerminal={detail.isTerminal}
			showInterrupts={detail.showInterrupts}
			refTime={refTime}
			onRefresh={detail.refresh}
			onSync={detail.syncRun}
			watched={watched}
			maxReached={maxReached}
			onToggleWatch={() => toggleWatch(runId)}
			cancelConfirm={detail.cancelConfirm}
			onCancelRequest={() => detail.setCancelConfirm(true)}
			onCancelConfirm={detail.handleCancel}
			onCancelDismiss={() => detail.setCancelConfirm(false)}
			cancelling={detail.cancelling}
		/>
	)
}

interface RunDetailLoadedProps {
	run: Run
	pr: PullRequest | null
	steps: ReturnType<typeof useRunDetail>['steps']
	sessions: ReturnType<typeof useRunDetail>['sessions']
	events: ReturnType<typeof useEventStream>['events']
	attentionRequests: ReturnType<typeof useRunDetail>['attentionRequests']
	interrupts: ReturnType<typeof useRunDetail>['interrupts']
	isTerminal: boolean
	showInterrupts: boolean
	refTime: number
	onRefresh: () => void
	onSync: () => void
	watched: boolean
	maxReached: boolean
	onToggleWatch: () => void
	cancelConfirm: boolean
	onCancelRequest: () => void
	onCancelConfirm: () => void
	onCancelDismiss: () => void
	cancelling: boolean
}

function pinClass(watched: boolean, maxReached: boolean): string {
	if (watched) return 'border-accent/40 bg-accent-soft text-accent'
	if (maxReached) return 'opacity-40 cursor-not-allowed'
	return ''
}

function pinTitle(watched: boolean, maxReached: boolean): string {
	if (watched) return 'Remove from watch rail'
	if (maxReached) return 'Max 5 watched'
	return 'Pin to watch rail'
}

function RunDetailLoaded({
	run,
	pr,
	steps,
	sessions,
	events,
	attentionRequests,
	interrupts,
	isTerminal,
	showInterrupts,
	refTime,
	onRefresh,
	onSync,
	watched,
	maxReached,
	onToggleWatch,
	cancelConfirm,
	onCancelRequest,
	onCancelConfirm,
	onCancelDismiss,
	cancelling
}: RunDetailLoadedProps) {
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
					onClick={onToggleWatch}
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
					onClick={onRefresh}
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
						onClick={onCancelRequest}
						aria-label="Cancel run"
						title="Cancel run"
						className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:ring-2 focus-visible:ring-danger/40 focus-visible:outline-none"
					>
						<Square size={12} strokeWidth={1.75} aria-hidden="true" className="fill-current" />
					</button>
				) : null}
			</>
		),
		[pr, isTerminal, watched, maxReached, onCancelRequest, onRefresh, onToggleWatch]
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
				onSync={onSync}
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
					if (!open) onCancelDismiss()
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
				onConfirm={onCancelConfirm}
			/>
			<ChatDrawer subject={{ kind: 'run', run_id: run.id }} />
		</div>
	)
}
