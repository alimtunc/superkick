import { ReviewResults } from '@/components/run-detail/ReviewResults'
import { RunBudgetCard } from '@/components/run-detail/RunBudgetCard'
import { RunDecisionBanner } from '@/components/run-detail/RunDecisionBanner'
import { RunDetailHeader } from '@/components/run-detail/RunDetailHeader'
import { RunHero } from '@/components/run-detail/RunHero'
import { RunLedger } from '@/components/run-detail/RunLedger'
import { RunPauseBanner } from '@/components/run-detail/RunPauseBanner'
import { SessionList } from '@/components/run-detail/SessionList'
import { StepTimeline } from '@/components/run-detail/StepTimeline'
import { TerminalTakeover } from '@/components/run-detail/TerminalTakeover'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { ChatDrawer } from '@/components/workspace/ChatDrawer'
import { EvidenceSection } from '@/components/workspace/EvidenceSection'
import { useEventStream } from '@/hooks/useEventStream'
import { useRunDetail } from '@/hooks/useRunDetail'
import { useWatchedSessionsStore } from '@/stores/watchedSessions'
import { FileSearch } from 'lucide-react'

export function RunDetailView({ runId, refTime = Date.now() }: { runId: string; refTime?: number }) {
	const detail = useRunDetail(runId)
	const stream = useEventStream(runId, detail.syncRun)
	const { isWatched, toggleWatch, maxReached } = useWatchedSessionsStore()
	const watched = isWatched(runId)

	if (detail.loading)
		return (
			<div className="mx-auto max-w-7xl px-5 py-6">
				<LoadingState rows={5} />
			</div>
		)
	if (detail.error)
		return (
			<div className="mx-auto max-w-7xl px-5 py-6">
				<ErrorState title="Run load failed" message={detail.error} onRetry={detail.refresh} />
			</div>
		)
	if (!detail.run)
		return (
			<div className="mx-auto max-w-7xl px-5 py-6">
				<EmptyState
					icon={FileSearch}
					title="Run not found"
					description="It may have been deleted or the identifier is wrong."
				/>
			</div>
		)

	const ledgerOpen = !detail.isTerminal
	const hasReviews = detail.steps.some((s) => s.step_key === 'review_swarm')

	return (
		<>
			<RunDetailHeader
				run={detail.run}
				pr={detail.pr}
				isTerminal={detail.isTerminal}
				onRefresh={detail.refresh}
				watched={watched}
				maxReached={maxReached}
				onToggleWatch={() => toggleWatch(runId)}
				cancelConfirm={detail.cancelConfirm}
				onCancelRequest={() => detail.setCancelConfirm(true)}
				onCancelConfirm={detail.handleCancel}
				onCancelDismiss={() => detail.setCancelConfirm(false)}
				cancelling={detail.cancelling}
			/>

			<div className="mx-auto max-w-7xl px-5 py-6">
				<RunPauseBanner run={detail.run} />
				<RunDecisionBanner
					runId={detail.run.id}
					attentionRequests={detail.attentionRequests}
					interrupts={detail.interrupts}
					showInterrupts={detail.showInterrupts}
					isTerminal={detail.isTerminal}
					onSync={detail.syncRun}
				/>
				<div className="mt-5 grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
					<aside className="space-y-5">
						<RunHero
							run={detail.run}
							pr={detail.pr}
							sessions={detail.sessions}
							attentionRequests={detail.attentionRequests}
							interrupts={detail.interrupts}
							refTime={refTime}
						/>
						<RunBudgetCard run={detail.run} steps={detail.steps} refTime={refTime} />
					</aside>
					<div className="min-w-0 space-y-3">
						<EvidenceSection title="Orchestration ledger" defaultOpen={ledgerOpen}>
							<RunLedger
								events={stream.events}
								sessions={detail.sessions}
								attentionRequests={detail.attentionRequests}
							/>
						</EvidenceSection>
						<EvidenceSection title="Run progress" defaultOpen={ledgerOpen}>
							<StepTimeline steps={detail.steps} />
						</EvidenceSection>
						{detail.sessions.length > 0 ? (
							<EvidenceSection
								title="Active work"
								count={detail.sessions.length}
								defaultOpen={!detail.isTerminal}
							>
								<SessionList
									sessions={detail.sessions}
									run={detail.run}
									isTerminal={detail.isTerminal}
								/>
							</EvidenceSection>
						) : null}
						{hasReviews ? (
							<EvidenceSection title="Review results" defaultOpen>
								<ReviewResults steps={detail.steps} />
							</EvidenceSection>
						) : null}
						<EvidenceSection title="Terminal inspection">
							<TerminalTakeover runId={detail.run.id} isTerminal={detail.isTerminal} />
						</EvidenceSection>
					</div>
				</div>
			</div>
			<ChatDrawer subject={{ kind: 'run', run_id: detail.run.id }} />
		</>
	)
}
