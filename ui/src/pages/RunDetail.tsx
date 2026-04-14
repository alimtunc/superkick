import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { SessionWatchRail } from '@/components/dashboard/SessionWatchRail'
import { AttentionRequestPanel } from '@/components/run-detail/AttentionRequestPanel'
import { EventsPanel } from '@/components/run-detail/EventsPanel'
import { InterruptPanel } from '@/components/run-detail/InterruptPanel'
import { PtyTerminal } from '@/components/run-detail/PtyTerminal'
import { RaiseAttentionRequestForm } from '@/components/run-detail/RaiseAttentionRequestForm'
import { ReviewResults } from '@/components/run-detail/ReviewResults'
import { RunDetailHeader } from '@/components/run-detail/RunDetailHeader'
import { RunDetailsGrid } from '@/components/run-detail/RunDetailsGrid'
import { SessionList } from '@/components/run-detail/SessionList'
import { StepTimeline } from '@/components/run-detail/StepTimeline'
import { useEventStream } from '@/hooks/useEventStream'
import { useRunDetail } from '@/hooks/useRunDetail'
import { queryKeys } from '@/lib/queryKeys'
import { useWatchedSessionsStore } from '@/stores/watchedSessions'
import { useQueryClient } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'

export function RunDetailPage() {
	const { runId } = useParams({ from: '/runs/$runId' })
	const queryClient = useQueryClient()
	const refTime = queryClient.getQueryState(queryKeys.runs.all)?.dataUpdatedAt || Date.now()

	return <RunDetail key={runId} runId={runId} refTime={refTime} />
}

function RunDetail({ runId, refTime }: { runId: string; refTime: number }) {
	const detail = useRunDetail(runId)
	const stream = useEventStream(runId, detail.syncRun)
	const { isWatched, toggleWatch, maxReached } = useWatchedSessionsStore()
	const watched = isWatched(runId)

	if (detail.loading) return <p className="font-data p-6 text-dim">Loading...</p>
	if (detail.error) return <p className="font-data p-6 text-oxide">{detail.error}</p>
	if (!detail.run) return <p className="font-data p-6 text-dim">Run not found.</p>

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

			<SessionWatchRail refTime={refTime} mode="detail" />

			<div className="mx-auto max-w-4xl px-5 py-6">
				<RunDetailsGrid run={detail.run} pr={detail.pr} />

				<section className="mb-6">
					<SectionTitle title="STEPS" />
					<StepTimeline steps={detail.steps} />
				</section>

				{detail.sessions.length > 0 ? (
					<section className="mb-6">
						<SectionTitle title="AGENT SESSIONS" />
						<SessionList
							sessions={detail.sessions}
							run={detail.run}
							isTerminal={detail.isTerminal}
						/>
					</section>
				) : null}

				{detail.isTerminal && detail.attentionRequests.length === 0 ? null : (
					<section className="mb-6">
						<SectionTitle title="ATTENTION REQUESTS" accent="gold" />
						<AttentionRequestPanel
							runId={detail.run.id}
							requests={detail.attentionRequests}
							onUpdated={detail.syncRun}
						/>
						{detail.isTerminal ? null : (
							<div className="mt-3">
								<RaiseAttentionRequestForm runId={detail.run.id} onCreated={detail.syncRun} />
							</div>
						)}
					</section>
				)}

				<section className="mb-6">
					<SectionTitle title="TERMINAL" />
					<p className="font-data mb-2 text-[11px] text-dim">
						Live PTY — direct interaction with the run's agent. Use attention requests above for
						structured product-level decisions.
					</p>
					<PtyTerminal runId={detail.run.id} isTerminal={detail.isTerminal} />
				</section>

				<section className="mb-6">
					<EventsPanel events={stream.events} />
				</section>

				<ReviewResults steps={detail.steps} />

				{detail.showInterrupts ? (
					<section className="mb-6">
						<SectionTitle title="INTERRUPTS" accent="gold" />
						<InterruptPanel
							runId={detail.run.id}
							interrupts={detail.interrupts}
							onAnswered={detail.syncRun}
						/>
					</section>
				) : null}
			</div>
		</>
	)
}
