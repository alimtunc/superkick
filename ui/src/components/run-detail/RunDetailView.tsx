import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { AttentionRequestPanel } from '@/components/run-detail/AttentionRequestPanel'
import { InterruptPanel } from '@/components/run-detail/InterruptPanel'
import { RaiseAttentionRequestForm } from '@/components/run-detail/RaiseAttentionRequestForm'
import { ReviewResults } from '@/components/run-detail/ReviewResults'
import { RunBudgetCard } from '@/components/run-detail/RunBudgetCard'
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
import { useEventStream } from '@/hooks/useEventStream'
import { useRunDetail } from '@/hooks/useRunDetail'
import { useWatchedSessionsStore } from '@/stores/watchedSessions'
import { FileSearch } from 'lucide-react'

function attentionSectionTitle(hasPending: boolean, total: number): string {
	if (hasPending) return 'Needs your decision'
	if (total > 0) return 'Attention history'
	return 'Raise an attention request'
}

export function RunDetailView({ runId, refTime = Date.now() }: { runId: string; refTime?: number }) {
	const detail = useRunDetail(runId)
	const stream = useEventStream(runId, detail.syncRun)
	const { isWatched, toggleWatch, maxReached } = useWatchedSessionsStore()
	const watched = isWatched(runId)

	if (detail.loading)
		return (
			<div className="mx-auto max-w-4xl px-5 py-6">
				<LoadingState rows={5} />
			</div>
		)
	if (detail.error)
		return (
			<div className="mx-auto max-w-4xl px-5 py-6">
				<ErrorState title="Run load failed" message={detail.error} onRetry={detail.refresh} />
			</div>
		)
	if (!detail.run)
		return (
			<div className="mx-auto max-w-4xl px-5 py-6">
				<EmptyState
					icon={FileSearch}
					title="Run not found"
					description="It may have been deleted or the identifier is wrong."
				/>
			</div>
		)

	const hasPendingAttention = detail.attentionRequests.some((r) => r.status === 'pending')
	const showAttentionBlock = detail.attentionRequests.length > 0 || !detail.isTerminal
	const attentionAccent = hasPendingAttention ? 'gold' : undefined
	const attentionTitle = attentionSectionTitle(hasPendingAttention, detail.attentionRequests.length)

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

			<div className="mx-auto max-w-4xl px-5 py-6">
				<RunPauseBanner run={detail.run} />

				<RunHero
					run={detail.run}
					pr={detail.pr}
					sessions={detail.sessions}
					attentionRequests={detail.attentionRequests}
					interrupts={detail.interrupts}
					refTime={refTime}
				/>

				<RunBudgetCard run={detail.run} steps={detail.steps} refTime={refTime} />

				{detail.showInterrupts ? (
					<section className="mb-8">
						<SectionTitle title="Interrupts" accent="gold" />
						<InterruptPanel
							runId={detail.run.id}
							interrupts={detail.interrupts}
							onAnswered={detail.syncRun}
						/>
					</section>
				) : null}

				{showAttentionBlock ? (
					<section className="mb-8">
						<SectionTitle title={attentionTitle} accent={attentionAccent} />
						{detail.attentionRequests.length > 0 ? (
							<AttentionRequestPanel
								runId={detail.run.id}
								requests={detail.attentionRequests}
								onUpdated={detail.syncRun}
							/>
						) : null}
						{!detail.isTerminal ? (
							<div className="mt-3">
								<RaiseAttentionRequestForm runId={detail.run.id} onCreated={detail.syncRun} />
							</div>
						) : null}
					</section>
				) : null}

				<section className="mb-8">
					<SectionTitle title="Orchestration ledger" />
					<RunLedger
						events={stream.events}
						sessions={detail.sessions}
						attentionRequests={detail.attentionRequests}
					/>
				</section>

				<section className="mb-8">
					<SectionTitle title="Run progress" />
					<StepTimeline steps={detail.steps} />
				</section>

				{detail.sessions.length > 0 ? (
					<section className="mb-8">
						<SectionTitle title="Active work" />
						<SessionList
							sessions={detail.sessions}
							run={detail.run}
							isTerminal={detail.isTerminal}
						/>
					</section>
				) : null}

				<ReviewResults steps={detail.steps} />

				<section className="mb-6 space-y-3">
					<SectionTitle title="Terminal inspection" />
					<p className="font-data text-[11px] text-ash">
						Supporting evidence only. Use the orchestration ledger above for run understanding.
					</p>
					<TerminalTakeover runId={detail.run.id} isTerminal={detail.isTerminal} />
				</section>
			</div>
		</>
	)
}
