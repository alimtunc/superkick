import { useState } from 'react'

import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { SessionWatchRail } from '@/components/dashboard/SessionWatchRail'
import { EventStream } from '@/components/run-detail/EventStream'
import { InterruptPanel } from '@/components/run-detail/InterruptPanel'
import { ReviewResults } from '@/components/run-detail/ReviewResults'
import { RunDetailHeader } from '@/components/run-detail/RunDetailHeader'
import { RunDetailsGrid } from '@/components/run-detail/RunDetailsGrid'
import { SessionList } from '@/components/run-detail/SessionList'
import { StepTimeline } from '@/components/run-detail/StepTimeline'
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
	const d = useRunDetail(runId)
	const [streaming, setStreaming] = useState(() => !d.isTerminal)
	const { isWatched, toggleWatch, maxReached } = useWatchedSessionsStore()
	const watched = isWatched(runId)

	if (d.loading) return <p className="font-data p-6 text-dim">Loading...</p>
	if (d.error) return <p className="font-data p-6 text-oxide">{d.error}</p>
	if (!d.run) return <p className="font-data p-6 text-dim">Run not found.</p>

	return (
		<>
			<RunDetailHeader
				run={d.run}
				pr={d.pr}
				isTerminal={d.isTerminal}
				streaming={streaming}
				onToggleStream={() => setStreaming((v) => !v)}
				onRefresh={d.refresh}
				watched={watched}
				maxReached={maxReached}
				onToggleWatch={() => toggleWatch(runId)}
				cancelConfirm={d.cancelConfirm}
				onCancelRequest={() => d.setCancelConfirm(true)}
				onCancelConfirm={d.handleCancel}
				onCancelDismiss={() => d.setCancelConfirm(false)}
				cancelling={d.cancelling}
			/>

			<SessionWatchRail refTime={refTime} mode="detail" />

			<div className="mx-auto max-w-4xl px-5 py-6">
				<RunDetailsGrid run={d.run} pr={d.pr} />

				<section className="mb-6">
					<SectionTitle title="STEPS" />
					<StepTimeline steps={d.steps} />
				</section>

				{d.sessions.length > 0 ? (
					<section className="mb-6">
						<SectionTitle title="AGENT SESSIONS" />
						<SessionList sessions={d.sessions} run={d.run} isTerminal={d.isTerminal} />
					</section>
				) : null}

				<ReviewResults steps={d.steps} />

				{d.showInterrupts ? (
					<section className="mb-6">
						<SectionTitle title="INTERRUPTS" accent="gold" />
						<InterruptPanel runId={d.run.id} interrupts={d.interrupts} onAnswered={d.syncRun} />
					</section>
				) : null}

				<section>
					<SectionTitle title="EVENTS" />
					<EventStream runId={d.run.id} active={streaming} onStateChange={d.syncRun} />
				</section>
			</div>
		</>
	)
}
