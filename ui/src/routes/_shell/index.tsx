import { useCallback, useRef } from 'react'

import { DistPanel } from '@/components/dashboard/DistPanel'
import { DurationRow } from '@/components/dashboard/DurationRow'
import { FocusedRunPanel } from '@/components/dashboard/FocusedRunPanel'
import { QueueColumn } from '@/components/dashboard/QueueColumn'
import { QueueSummary } from '@/components/dashboard/QueueSummary'
import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { useDashboardRuns } from '@/hooks/useDashboardRuns'
import { useOperatorQueue } from '@/hooks/useOperatorQueue'
import { avgDuration, medianDuration, stateDistribution } from '@/lib/domain'
import { dashboardQueueQuery, runsQuery } from '@/lib/queries'
import type { OperatorQueue } from '@/types'
import { OPERATOR_QUEUES } from '@/types'
import { createRoute } from '@tanstack/react-router'

import { Route as shellRoute } from './route'

export const Route = createRoute({
	getParentRoute: () => shellRoute,
	path: '/',
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(runsQuery()),
			context.queryClient.ensureQueryData(dashboardQueueQuery())
		]),
	component: OverviewPage
})

function OverviewPage() {
	const queue = useOperatorQueue()
	const reliability = useDashboardRuns()
	const columnRefs = useRef<Map<OperatorQueue, HTMLDivElement | null>>(new Map())

	// One stable callback per mount; uses a `data-queue` attribute to key the
	// Map so React 19 doesn't detach/reattach refs on every render.
	const registerColumnRef = useCallback((el: HTMLDivElement | null) => {
		if (!el) return
		const queueId = el.dataset.queue as OperatorQueue | undefined
		if (queueId) columnRefs.current.set(queueId, el)
	}, [])

	const jumpToQueue = useCallback((queueId: OperatorQueue) => {
		columnRefs.current.get(queueId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
	}, [])

	const errorMessage = queue.error ?? reliability.error

	return (
		<>
			<FocusedRunPanel refTime={reliability.refTime} />

			<div className="mx-auto flex max-w-360 flex-col gap-16 px-6 py-12">
				<header className="flex flex-col gap-1">
					<h1 className="font-data text-[20px] tracking-wider text-fog uppercase">Inbox</h1>
					<p className="font-data text-[11px] text-dim">
						Triage what needs your attention before launching new work.
					</p>
				</header>

				{errorMessage ? (
					<div className="panel glow-red font-data p-3 text-[12px] text-oxide">{errorMessage}</div>
				) : null}

				{/* ── Operator queue ── */}
				<div className="flex flex-col gap-6">
					<div className="flex flex-wrap items-baseline gap-4">
						<h2 className="font-data text-[13px] tracking-widest text-fog uppercase">
							Operator Queue
						</h2>
						<p className="font-data text-[11px] text-dim">
							{queue.actionable > 0
								? `${queue.actionable} need action · ${queue.totalInFlight} in flight`
								: `${queue.totalInFlight} in flight · all clear`}
						</p>
						{queue.generatedAt ? (
							<p className="font-data ml-auto text-[10px] text-dim">
								refreshed {new Date(queue.generatedAt).toLocaleTimeString()}
							</p>
						) : null}
					</div>
					<QueueSummary groups={queue.groups} totals={queue.totals} onJump={jumpToQueue} />
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
						{OPERATOR_QUEUES.map((queueId) => (
							<div key={queueId} ref={registerColumnRef} data-queue={queueId}>
								<QueueColumn
									queue={queueId}
									runs={queue.groups[queueId]}
									refTime={queue.refTime}
								/>
							</div>
						))}
					</div>
				</div>

				{/* ── Reliability ── */}
				<section className="fade-up">
					<SectionTitle title="RELIABILITY" />
					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<DistPanel
							title="By State"
							items={stateDistribution(reliability.runs)}
							total={reliability.runs.length}
						/>
						<DistPanel
							title="Terminal Outcomes"
							items={[
								{
									label: 'Completed',
									count: reliability.completed.length,
									color: 'bg-mineral'
								},
								{ label: 'Failed', count: reliability.failed.length, color: 'bg-oxide' },
								{
									label: 'Cancelled',
									count: reliability.cancelled.length,
									color: 'bg-dim'
								}
							]}
							total={reliability.terminal.length}
						/>
						<div className="panel p-4">
							<h4 className="font-data mb-4 text-[10px] tracking-wider text-dim uppercase">
								Avg Duration
							</h4>
							<div className="space-y-3">
								<DurationRow
									label="Completed"
									value={avgDuration(reliability.completed)}
									color="text-mineral"
								/>
								<DurationRow
									label="Failed"
									value={avgDuration(reliability.failed)}
									color="text-oxide"
								/>
								<DurationRow
									label="Median (all)"
									value={medianDuration(reliability.runs)}
									color="text-silver"
								/>
							</div>
						</div>
					</div>
				</section>

				<div className="h-10" />
			</div>
		</>
	)
}
